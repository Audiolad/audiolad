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
  businessWorkspacePublicPath,
} from "@/lib/access-grants/paths";
import { isEmailConfirmed, formatMoscowDateTime } from "@/lib/access-grants/policy";
import { createSupabaseAccessGrantStore } from "@/lib/access-grants/supabase-store";
import { parseBusinessEligibilityPayload } from "@/lib/business-app/eligibility";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { GUEST_COFFEE_RIGHTS_URL } from "@/lib/business-app/guest-coffee/copy";
import { emailNotReceivedArticle } from "@/lib/help/articles/troubleshooting/email-not-received";
import { helpArticlePath } from "@/lib/help/paths";
import { BUSINESS_PLAN_PERIOD_LABEL, formatBusinessMonthlyPrice } from "@/lib/business/plan";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { selectWorkspaceTracks, type SpaceAdmission, type TrackEligibility } from "./catalog";
import { workspacePlayerOpen, type WorkspacePageModel, type WorkspaceTrack } from "./model";
import { resolveBusinessSpace, type BusinessSpaceId } from "./spaces";

const HELP_HREF = helpArticlePath(emailNotReceivedArticle);

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
    playback: null,
    helpHref: HELP_HREF,
    rightsHref: GUEST_COFFEE_RIGHTS_URL,
    onboardingHref: "/onboarding",
    signUpHref: BUSINESS_TRIAL_SIGN_UP_HREF,
    signInHref: BUSINESS_TRIAL_SIGN_IN_HREF,
    cafeHref: businessWorkspacePublicPath("cafe"),
  };
}

export async function loadWorkspaceCatalog(input: {
  spaceId: BusinessSpaceId;
  locationId: string | null;
  spaceEnabled: boolean;
}): Promise<{ tracks: WorkspaceTrack[]; unavailable: boolean }> {
  if (!input.spaceEnabled) return { tracks: [], unavailable: false };
  let db: ReturnType<typeof createServiceRoleClient>;
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

  const admissions: SpaceAdmission[] = [];
  for (const row of admitted.data as { space_id?: string; audio_item_id?: string }[]) {
    if (row.space_id === input.spaceId && typeof row.audio_item_id === "string") {
      admissions.push({ spaceId: input.spaceId, audioItemId: row.audio_item_id });
    }
  }

  const eligibility: TrackEligibility[] = [];
  for (const admission of admissions) {
    if (!input.locationId) {
      eligibility.push({ audioItemId: admission.audioItemId, decision: "UNKNOWN" });
      continue;
    }
    const { data, error } = await db.rpc("resolve_business_track_eligibility", {
      p_audio_item_id: admission.audioItemId,
      p_location_id: input.locationId,
      p_zone_id: null,
      p_use_type: "business_background_playback",
    });
    const parsed = error ? null : parseBusinessEligibilityPayload(data, admission.audioItemId);
    eligibility.push({
      audioItemId: admission.audioItemId,
      decision: parsed?.decision ?? "UNKNOWN",
    });
  }

  const ids = selectWorkspaceTracks({
    spaceId: input.spaceId,
    spaceEnabled: input.spaceEnabled,
    admissions,
    eligibility,
  });
  if (ids.length === 0) return { tracks: [], unavailable: false };

  const titles = await db.from("audio_items").select("id, title, duration_seconds").in("id", ids);
  if (titles.error || !Array.isArray(titles.data)) return { tracks: [], unavailable: true };
  const byId = new Map(
    (titles.data as { id: string; title: string | null; duration_seconds: number | null }[]).map((row) => [row.id, row]),
  );
  const tracks = ids.map((id) => {
    const row = byId.get(id);
    return {
      audioItemId: id,
      title: row?.title?.trim() || "Трек",
      durationSeconds: typeof row?.duration_seconds === "number" ? row.duration_seconds : null,
    };
  });
  return { tracks, unavailable: false };
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
    if (workspacePlayerOpen({ status, spaceEnabled: space.enabled })) {
      const domain = await loadBusinessOwnerHomeContext();
      const locationId = domain.status === "authenticated" ? domain.location?.id ?? null : null;
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
