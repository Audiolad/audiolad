import "server-only";

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
  WORKSPACE_RIGHTS_CONCURRENCY,
  mapPool,
} from "./eligibility-cache";
import { workspacePlayerOpen, type WorkspacePageModel, type WorkspaceTrack } from "./model";
import { resolveBusinessSpace, type BusinessSpaceId } from "./spaces";

const HELP_HREF = helpArticlePath(emailNotReceivedArticle);
const PAGE_SIZE = 500;
const ID_CHUNK = 80;

type ServiceDb = ReturnType<typeof createServiceRoleClient>;

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
): Promise<BusinessEligibilityDecision> {
  const { data, error } = await db.rpc("resolve_business_track_eligibility", {
    p_audio_item_id: audioItemId,
    p_location_id: locationId,
    p_zone_id: null,
    p_use_type: "business_background_playback",
  });
  if (error) return "UNKNOWN";
  const parsed = parseBusinessEligibilityPayload(data, audioItemId);
  if (!parsed) return "UNKNOWN";
  return parsed.decision;
}

/** Fresh decisions on every request: a manual revocation must not wait for a TTL. */
async function loadEligibility(
  db: ServiceDb,
  locationId: string | null,
  audioItemIds: readonly string[],
): Promise<TrackEligibility[]> {
  if (!locationId) return audioItemIds.map((audioItemId) => ({ audioItemId, decision: "UNKNOWN" }));
  return mapPool(audioItemIds, WORKSPACE_RIGHTS_CONCURRENCY, async (audioItemId) => ({
    audioItemId, decision: await resolveDecision(db, locationId, audioItemId),
  }));
}

type PracticeRow = {
  id: string;
  title: string | null;
  author_id: string | null;
  author_name: string | null;
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
  locationId: string | null,
): Promise<WorkspaceCatalogCandidate[] | "error"> {
  if (!locationId) return [];
  const sources = sourcesForSpace(spaceId);
  const practices = await selectPages<PracticeRow>((from, to) => db
    .rpc("business_content_candidate_albums", { p_location_id: locationId }).range(from, to));
  if (!practices) return "error";
  const authorIds = [...new Set(practices.flatMap((row) => row.author_id ? [row.author_id] : []))].sort();
  const nameByAuthor = new Map(practices.map((row) => [row.author_id, row.author_name?.trim() || ""]));

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
    sourceRows.push({ ...row, shelf: source?.shelf ?? "cafe" });
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

  // Legacy per-track admissions and curated author UUIDs cannot open access.
  // The shared manual resolver supplies candidates; the common rights engine checks each track.
  const curated = await loadCuratedCandidates(db, input.spaceId, input.locationId);
  if (curated === "error") return { tracks: [], unavailable: true };
  const named = curated.flatMap((row) => {
    const track = candidateTrack(row);
    return track ? [track] : [];
  });
  const admissions: SpaceAdmission[] = named.map((track) => ({ spaceId: input.spaceId, audioItemId: track.audioItemId }));
  const curatedById = new Map(named.map((track) => [track.audioItemId, track]));

  const eligibility = await loadEligibility(db, input.locationId, admissions.map((row) => row.audioItemId));
  const ids = selectWorkspaceTracks({
    spaceId: input.spaceId,
    spaceEnabled: input.spaceEnabled,
    admissions,
    eligibility,
  });
  if (ids.length === 0) return { tracks: [], unavailable: false };

  return {
    tracks: ids.flatMap((id) => {
      const track = curatedById.get(id);
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
