import "server-only";
import { soundAllowedTrackIds } from "@/lib/business/track-sound-review.server";

import { activateBusinessTrial, recordAccessActivity } from "@/lib/access-grants/apply";
import {
  BUSINESS_GIFT_TITLE,
  BUSINESS_STORE_UNAVAILABLE_NOTE,
  businessGiftRulesText,
} from "@/lib/access-grants/copy";
import {
  BUSINESS_TRIAL_SIGN_IN_HREF,
  BUSINESS_TRIAL_SIGN_UP_HREF,
  businessCabinetOnboardingPath,
  businessWorkspacePublicPath,
} from "@/lib/access-grants/paths";
import { isEmailConfirmed, formatMoscowDateTime } from "@/lib/access-grants/policy";
import { createSupabaseAccessGrantStore } from "@/lib/access-grants/supabase-store";
import { parseBusinessEligibilityPayload, type BusinessEligibilityDecision } from "@/lib/business-app/eligibility";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { GUEST_COFFEE_RIGHTS_URL } from "@/lib/business-app/guest-coffee/copy";
import { emailNotReceivedArticle } from "@/lib/help/articles/troubleshooting/email-not-received";
import { helpArticlePath } from "@/lib/help/paths";
import { resolvePlayableAudioItemRows } from "@/lib/listen/validated-active-music-delivery";
import { BUSINESS_PLAN_PERIOD_LABEL, formatBusinessMonthlyPrice } from "@/lib/business/plan";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  acceptWorkspaceCatalogSourceRow,
  orderWorkspaceCatalogRows,
  type WorkspaceCatalogCandidate,
  type WorkspaceCatalogSourceRow,
} from "./candidates";
import { sourcesForSpace } from "./catalog-sources";
import { workspaceTrackWithDisplayTitle } from "./display-title";
import { selectWorkspaceTracks, type SpaceAdmission, type TrackEligibility } from "./catalog";
import {
  WORKSPACE_RIGHTS_CACHE_MS,
  WORKSPACE_RIGHTS_CONCURRENCY,
  createTtlDecisionCache,
  mapPool,
  type TtlDecisionCache,
} from "./eligibility-cache";
import { workspacePlayerOpen, type WorkspacePageModel, type WorkspaceTrack } from "./model";
import { resolveBusinessSpace, type BusinessSpaceId } from "./spaces";

const HELP_HREF = helpArticlePath(emailNotReceivedArticle);
const PAGE_SIZE = 500;
const ID_CHUNK = 80;

type ServiceDb = ReturnType<typeof createServiceRoleClient>;

type CatalogCache = {
  decisions: TtlDecisionCache<BusinessEligibilityDecision>;
  inflight: Map<string, Promise<BusinessEligibilityDecision>>;
  curated: { key: string; at: number; rows: WorkspaceCatalogCandidate[] } | null;
};

function catalogCache(): CatalogCache {
  const holder = globalThis as typeof globalThis & { __audioladWorkspaceCatalog?: CatalogCache };
  if (!holder.__audioladWorkspaceCatalog) {
    holder.__audioladWorkspaceCatalog = {
      decisions: createTtlDecisionCache(WORKSPACE_RIGHTS_CACHE_MS),
      inflight: new Map(),
      curated: null,
    };
  }
  return holder.__audioladWorkspaceCatalog;
}

function baseModel(spaceId: BusinessSpaceId, spaceTitle: string, spaceEnabled: boolean): WorkspacePageModel {
  return {
    spaceId,
    spaceTitle,
    spaceEnabled,
    status: "anonymous",
    daysLeft: null,
    endsAtLabel: null,
    endsAt: null,
    priceLabel: formatBusinessMonthlyPrice(),
    periodLabel: BUSINESS_PLAN_PERIOD_LABEL,
    rules: businessGiftRulesText(),
    tracks: [],
    needsVenue: false,
    playback: null,
    helpHref: HELP_HREF,
    rightsHref: GUEST_COFFEE_RIGHTS_URL,
    onboardingHref: businessCabinetOnboardingPath(spaceId),
    signUpHref: BUSINESS_TRIAL_SIGN_UP_HREF,
    signInHref: BUSINESS_TRIAL_SIGN_IN_HREF,
    cafeHref: businessWorkspacePublicPath("cafe"),
  };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function embeddedName(value: unknown): string {
  const row = one(value as { name?: string | null } | { name?: string | null }[] | null);
  const name = row && typeof row.name === "string" ? row.name.trim() : "";
  return name;
}

async function selectPages<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; from < 4000; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) return null;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
  return rows;
}

async function resolveDecision(
  db: ServiceDb,
  locationId: string,
  audioItemId: string,
): Promise<{ decision: BusinessEligibilityDecision; cache: boolean }> {
  const { data, error } = await db.rpc("resolve_business_track_eligibility", {
    p_audio_item_id: audioItemId,
    p_location_id: locationId,
    p_zone_id: null,
    p_use_type: "business_background_playback",
  });
  if (error) return { decision: "UNKNOWN", cache: false };
  const parsed = parseBusinessEligibilityPayload(data, audioItemId);
  if (!parsed) return { decision: "UNKNOWN", cache: false };
  return { decision: parsed.decision, cache: true };
}

/**
 * No venue: every track is UNKNOWN and the rights RPC is not called (it cannot
 * return ELIGIBLE without a location). With a venue, decisions are cached for
 * five minutes and cold misses run with a small pool. A single batch RPC would
 * need a migration, so this stays on the existing function.
 */
async function loadEligibility(
  db: ServiceDb,
  locationId: string | null,
  audioItemIds: readonly string[],
): Promise<TrackEligibility[]> {
  if (!locationId) {
    return audioItemIds.map((audioItemId) => ({ audioItemId, decision: "UNKNOWN" }));
  }
  const bag = catalogCache();
  const missing: string[] = [];
  const known = new Map<string, BusinessEligibilityDecision>();
  for (const audioItemId of audioItemIds) {
    const hit = bag.decisions.get(`${locationId}:${audioItemId}`);
    if (hit) known.set(audioItemId, hit);
    else missing.push(audioItemId);
  }
  const fresh = await mapPool(missing, WORKSPACE_RIGHTS_CONCURRENCY, async (audioItemId) => {
    const key = `${locationId}:${audioItemId}`;
    const again = bag.decisions.get(key);
    if (again) return { audioItemId, decision: again };
    const pending = bag.inflight.get(key);
    if (pending) return { audioItemId, decision: await pending };
    const promise = resolveDecision(db, locationId, audioItemId).then((result) => {
      bag.inflight.delete(key);
      if (result.cache) bag.decisions.set(key, result.decision);
      return result.decision;
    });
    bag.inflight.set(key, promise);
    return { audioItemId, decision: await promise };
  });
  for (const row of fresh) known.set(row.audioItemId, row.decision);
  return audioItemIds.map((audioItemId) => ({
    audioItemId,
    decision: known.get(audioItemId) ?? "UNKNOWN",
  }));
}

type PracticeRow = {
  id: string;
  title: string | null;
  author_id: string | null;
  status: string | null;
  product_kind: string | null;
  catalog_visibility: string | null;
  deleted_at: string | null;
};

type AudioRow = {
  id: string;
  practice_id: string | null;
  title: string | null;
  duration_seconds: number | null;
  position: number | null;
  status: string | null;
  audio_path: string | null;
  active_music_delivery_asset_id: string | null;
};

async function loadCuratedCandidates(
  db: ServiceDb,
  spaceId: BusinessSpaceId,
): Promise<WorkspaceCatalogCandidate[] | "error"> {
  const sources = sourcesForSpace(spaceId);
  if (sources.length === 0) return [];
  const authorIds = sources.map((source) => source.authorId);
  const cacheKey = `${spaceId}:${authorIds.join(",")}`;
  const bag = catalogCache();
  const now = Date.now();
  if (bag.curated && bag.curated.key === cacheKey && now - bag.curated.at < WORKSPACE_RIGHTS_CACHE_MS) {
    return bag.curated.rows;
  }

  const authorNames = await db.from("authors").select("id, name").in("id", authorIds);
  if (authorNames.error || !Array.isArray(authorNames.data)) return "error";
  const nameByAuthor = new Map(
    (authorNames.data as { id: string; name: string | null }[]).map((row) => [row.id, row.name?.trim() || ""]),
  );

  const practices = await selectPages<PracticeRow>((from, to) => db
    .from("practices")
    .select("id, title, author_id, status, product_kind, catalog_visibility, deleted_at")
    .in("author_id", authorIds)
    .order("id", { ascending: true })
    .range(from, to));
  if (!practices) return "error";

  const allowedAuthors = new Set(authorIds);
  const sourceByAuthor = new Map(sources.map((source) => [source.authorId, source]));
  const practiceById = new Map<string, PracticeRow>();
  for (const practice of practices) {
    if (!practice.id || !practice.author_id) continue;
    if (!isListedPractice(practice)) continue;
    practiceById.set(practice.id, practice);
  }
  const practiceIds = [...practiceById.keys()];
  if (practiceIds.length === 0) {
    bag.curated = { key: cacheKey, at: now, rows: [] };
    return [];
  }

  const audioRows: AudioRow[] = [];
  for (let index = 0; index < practiceIds.length; index += ID_CHUNK) {
    const chunk = practiceIds.slice(index, index + ID_CHUNK);
    const page = await selectPages<AudioRow>((from, to) => db
      .from("audio_items")
      .select("id, practice_id, title, duration_seconds, position, status, audio_path, active_music_delivery_asset_id")
      .in("practice_id", chunk)
      .eq("status", "published")
      .order("id", { ascending: true })
      .range(from, to));
    if (!page) return "error";
    audioRows.push(...page);
  }

  const playable: AudioRow[] = [];
  for (let index = 0; index < audioRows.length; index += ID_CHUNK) {
    const part = await resolvePlayableAudioItemRows(audioRows.slice(index, index + ID_CHUNK), "music", {
      serviceRole: db,
    });
    playable.push(...part);
  }
  const playableIds = new Set(playable.map((row) => row.id));

  const sourceRows: Array<WorkspaceCatalogSourceRow & { shelf: WorkspaceCatalogCandidate["shelf"] }> = [];
  for (const audio of audioRows) {
    const practice = audio.practice_id ? practiceById.get(audio.practice_id) : undefined;
    if (!practice?.author_id) continue;
    const source = sourceByAuthor.get(practice.author_id);
    if (!source) continue;
    const row: WorkspaceCatalogSourceRow = {
      audioItemId: audio.id,
      authorId: practice.author_id,
      authorName: nameByAuthor.get(practice.author_id) || "",
      albumTitle: practice.title?.trim() || "",
      title: audio.title?.trim() || "",
      durationSeconds: typeof audio.duration_seconds === "number" ? audio.duration_seconds : null,
      position: typeof audio.position === "number" && Number.isFinite(audio.position) ? audio.position : 1_000_000,
      practiceStatus: practice.status,
      productKind: practice.product_kind,
      catalogVisibility: practice.catalog_visibility,
      deletedAt: practice.deleted_at,
      audioStatus: audio.status,
      audioPath: audio.audio_path,
      hasActiveDelivery: playableIds.has(audio.id) && !audio.audio_path?.trim(),
    };
    if (!acceptWorkspaceCatalogSourceRow(row, allowedAuthors)) continue;
    sourceRows.push({ ...row, shelf: source.shelf });
  }

  const ordered = orderWorkspaceCatalogRows(sourceRows, authorIds);
  const candidates: WorkspaceCatalogCandidate[] = ordered.map((row) => ({
    audioItemId: row.audioItemId,
    authorId: row.authorId,
    authorName: row.authorName,
    albumTitle: row.albumTitle,
    title: row.title,
    durationSeconds: row.durationSeconds,
    position: row.position,
    shelf: row.shelf,
  }));
  bag.curated = { key: cacheKey, at: now, rows: candidates };
  return candidates;
}

function isListedPractice(practice: PracticeRow): boolean {
  return practice.deleted_at == null
    && practice.status === "published"
    && practice.product_kind === "music"
    && practice.catalog_visibility === "listed";
}

function candidateTrack(row: WorkspaceCatalogCandidate): WorkspaceTrack | null {
  return workspaceTrackWithDisplayTitle({
    audioItemId: row.audioItemId,
    title: row.title.trim(),
    durationSeconds: row.durationSeconds,
    authorId: row.authorId,
    authorName: row.authorName.trim() || null,
    albumTitle: row.albumTitle.trim() || null,
    shelf: row.shelf,
  });
}

function plainTrack(id: string, title: string | null, duration: number | null): WorkspaceTrack {
  return {
    audioItemId: id,
    title: title?.trim() || "Трек",
    durationSeconds: typeof duration === "number" ? duration : null,
    authorId: null,
    authorName: null,
    albumTitle: null,
    shelf: "cafe",
  };
}

async function loadAdmissionTracks(db: ServiceDb, ids: readonly string[]): Promise<Map<string, WorkspaceTrack> | null> {
  const byId = new Map<string, WorkspaceTrack>();
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const chunk = ids.slice(index, index + ID_CHUNK);
    const joined = await db
      .from("audio_items")
      .select("id, title, duration_seconds, practices(title, author_id, authors!practices_author_id_fkey(name))")
      .in("id", chunk);
    if (joined.error || !Array.isArray(joined.data)) {
      const plain = await db.from("audio_items").select("id, title, duration_seconds").in("id", chunk);
      if (plain.error || !Array.isArray(plain.data)) return null;
      for (const row of plain.data as { id: string; title: string | null; duration_seconds: number | null }[]) {
        const track = workspaceTrackWithDisplayTitle(plainTrack(row.id, row.title, row.duration_seconds));
        if (track) byId.set(row.id, track);
      }
      continue;
    }
    for (const row of joined.data as {
      id: string;
      title: string | null;
      duration_seconds: number | null;
      practices: {
        title?: string | null;
        author_id?: string | null;
        authors?: { name?: string | null } | { name?: string | null }[] | null;
      } | {
        title?: string | null;
        author_id?: string | null;
        authors?: { name?: string | null } | { name?: string | null }[] | null;
      }[] | null;
    }[]) {
      const practice = one(row.practices);
      const named = workspaceTrackWithDisplayTitle({
        ...plainTrack(row.id, row.title, row.duration_seconds),
        authorId: practice?.author_id ?? null,
        authorName: embeddedName(practice?.authors) || null,
        albumTitle: practice?.title?.trim() || null,
      });
      if (named) byId.set(row.id, named);
    }
  }
  return byId;
}

export async function loadWorkspaceCatalog(input: {
  spaceId: BusinessSpaceId;
  locationId: string | null;
  spaceEnabled: boolean;
}): Promise<{ tracks: WorkspaceTrack[]; unavailable: boolean }> {
  if (!input.spaceEnabled) return { tracks: [], unavailable: false };
  let db: ServiceDb;
  try {
    db = createServiceRoleClient();
  } catch {
    return { tracks: [], unavailable: true };
  }

  const admitted = await db
    .from("business_space_admissions")
    .select("space_id, audio_item_id")
    .eq("space_id", input.spaceId);
  if (admitted.error || !Array.isArray(admitted.data)) return { tracks: [], unavailable: true };

  const admissionIds: string[] = [];
  const seenAdmissions = new Set<string>();
  for (const row of admitted.data as { space_id?: string; audio_item_id?: string }[]) {
    if (row.space_id !== input.spaceId || typeof row.audio_item_id !== "string") continue;
    if (seenAdmissions.has(row.audio_item_id)) continue;
    seenAdmissions.add(row.audio_item_id);
    admissionIds.push(row.audio_item_id);
  }

  let admissions: SpaceAdmission[];
  let curatedById: Map<string, WorkspaceTrack> | null = null;
  if (admissionIds.length > 0) {
    admissions = admissionIds.map((audioItemId) => ({ spaceId: input.spaceId, audioItemId }));
  } else {
    const curated = await loadCuratedCandidates(db, input.spaceId);
    if (curated === "error") return { tracks: [], unavailable: true };
    // Drop placeholder titles before the rights pool so «Аудио N» does not spend an RPC.
    const named = curated.flatMap((row) => {
      const track = candidateTrack(row);
      return track ? [track] : [];
    });
    admissions = named.map((track) => ({ spaceId: input.spaceId, audioItemId: track.audioItemId }));
    curatedById = new Map(named.map((track) => [track.audioItemId, track]));
  }

  // Never use curated source lists as manual admissions. The sound gate requires
  // the exact current space whitelist entry and the current approved audio version.
  try {
    const soundAllowed = await soundAllowedTrackIds(admissions.map((row) => row.audioItemId), input.spaceId, db);
    admissions = admissions.filter((row) => soundAllowed.has(row.audioItemId));
  } catch {
    return { tracks: [], unavailable: true };
  }
  const eligibility = await loadEligibility(db, input.locationId, admissions.map((row) => row.audioItemId));
  const ids = selectWorkspaceTracks({
    spaceId: input.spaceId,
    spaceEnabled: input.spaceEnabled,
    admissions,
    eligibility,
  });
  if (ids.length === 0) return { tracks: [], unavailable: false };

  if (curatedById) {
    return {
      tracks: ids.map((id) => curatedById.get(id)).filter((track): track is WorkspaceTrack => Boolean(track)),
      unavailable: false,
    };
  }

  const meta = await loadAdmissionTracks(db, ids);
  if (!meta) return { tracks: [], unavailable: true };
  return {
    tracks: ids.flatMap((id) => {
      const track = meta.get(id);
      return track ? [track] : [];
    }),
    unavailable: false,
  };
}

export async function loadWorkspaceAllowedIds(input: {
  spaceId: BusinessSpaceId;
  locationId: string | null;
  spaceEnabled: boolean;
}): Promise<string[] | null> {
  const catalog = await loadWorkspaceCatalog(input);
  if (catalog.unavailable) return null;
  return catalog.tracks.map((track) => track.audioItemId);
}

export async function loadWorkspacePage(spaceParam: string | null): Promise<WorkspacePageModel> {
  const space = resolveBusinessSpace(spaceParam);
  const model = baseModel(space.id, space.title, space.enabled);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return model;
  if (!isEmailConfirmed(user) || !user.email) return { ...model, status: "unconfirmed" };

  let store: ReturnType<typeof createSupabaseAccessGrantStore>;
  try {
    store = createSupabaseAccessGrantStore();
  } catch {
    return { ...model, status: "unavailable", rules: `${BUSINESS_STORE_UNAVAILABLE_NOTE} ${model.rules}` };
  }

  try {
    const activation = await activateBusinessTrial(store, { userId: user.id, email: user.email });
    await recordAccessActivity(store, { userId: user.id, email: user.email, action: "visit" });
    const status = activation.access.mode === "none" ? "unavailable" : activation.access.mode;
    const endsAtLabel = activation.access.endsAt
      ? formatMoscowDateTime(new Date(activation.access.endsAt))
      : null;
    let tracks: WorkspaceTrack[] = [];
    let needsVenue = false;
    if (workspacePlayerOpen({ status, spaceEnabled: space.enabled })) {
      const domain = await loadBusinessOwnerHomeContext();
      const locationId = domain.status === "authenticated" ? domain.location?.id ?? null : null;
      needsVenue = locationId == null;
      const catalog = await loadWorkspaceCatalog({
        spaceId: space.id,
        locationId,
        spaceEnabled: space.enabled,
      });
      if (catalog.unavailable) {
        return { ...model, status: "unavailable", rules: `${BUSINESS_STORE_UNAVAILABLE_NOTE} ${model.rules}` };
      }
      tracks = catalog.tracks;
    }
    const saved = await store.readPlayback(user.id, space.id);
    return {
      ...model,
      status,
      daysLeft: activation.access.daysLeft,
      endsAtLabel,
      endsAt: activation.access.endsAt,
      tracks,
      needsVenue,
      playback: saved
        ? {
            index: saved.index,
            positionSec: saved.positionSec,
            volume: saved.volume,
            updatedAt: saved.updatedAt,
          }
        : null,
    };
  } catch {
    return { ...model, status: "unavailable", rules: `${BUSINESS_STORE_UNAVAILABLE_NOTE} ${model.rules}` };
  }
}

export type WorkspaceActor =
  | { ok: false; reason: "no_access" | "unavailable" }
  | {
      ok: true;
      userId: string;
      email: string;
      playerOpen: boolean;
      locationId: string | null;
      space: ReturnType<typeof resolveBusinessSpace>;
    };

/** Session + gift/paid gate for workspace APIs. Does not trust ids from the request body. */
export async function loadWorkspaceActor(spaceParam: string | null): Promise<WorkspaceActor> {
  const space = resolveBusinessSpace(spaceParam);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isEmailConfirmed(user)) return { ok: false, reason: "no_access" };
  try {
    const store = createSupabaseAccessGrantStore();
    const activation = await activateBusinessTrial(store, { userId: user.id, email: user.email });
    const domain = await loadBusinessOwnerHomeContext();
    const locationId = domain.status === "authenticated" ? domain.location?.id ?? null : null;
    const playerOpen = workspacePlayerOpen({
      status: activation.access.mode === "none" ? "unavailable" : activation.access.mode,
      spaceEnabled: space.enabled,
    });
    return { ok: true, userId: user.id, email: user.email, playerOpen, locationId, space };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export { BUSINESS_GIFT_TITLE };
