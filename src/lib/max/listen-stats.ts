import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCoursePublication } from "@/lib/course-content/validators";
import { resolveListenAccess } from "@/lib/listen/access";
import {
  canAccrueListenStats,
  canBecomeRatingEligible,
} from "@/lib/listen/listen-stats-access";
import { applyOwnPracticeListenStatsHeartbeat } from "@/lib/listen/listen-stats-write";
import type { PracticeListenStatsOwnState } from "@/lib/listen/listen-stats";
import {
  isCatalogStorefrontPreviewEligible,
  resolveListenApiDecision,
} from "@/lib/listen/preview-access";
import {
  canAccessCourseContent,
  resolveProductAccess,
} from "@/lib/products/access";
import {
  getPracticeByAuthorAndSlug,
  type PublicPracticeRow,
} from "@/lib/products/lookup";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type MaxListenStatsPutBody = PracticeListenStatsOwnState;

export type MaxListenStatsCallResult =
  | { ok: true; status: 200; body: MaxListenStatsPutBody }
  | { ok: false; status: number; reason: string };

type ListenStatsDeps = {
  createClient?: () => SupabaseClient;
  getPractice?: typeof getPracticeByAuthorAndSlug;
  resolveAccess?: typeof resolveProductAccess;
  canAccessCourse?: typeof canAccessCourseContent;
  resolveListen?: typeof resolveListenAccess;
  applyHeartbeat?: typeof applyOwnPracticeListenStatsHeartbeat;
};

let listenStatsDeps: ListenStatsDeps | null = null;

export function setMaxListenStatsDepsForTests(deps: ListenStatsDeps | null) {
  listenStatsDeps = deps;
}

function client() {
  return (listenStatsDeps?.createClient ?? createServiceRoleClient)();
}

const AUDIO_ITEM_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseOptionalMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

async function loadPractice(
  authorSlug: string,
  productSlug: string,
): Promise<
  | { ok: true; practice: PublicPracticeRow; supabase: SupabaseClient }
  | { ok: false; status: number; reason: string }
> {
  const supabase = client();
  const getPractice = listenStatsDeps?.getPractice ?? getPracticeByAuthorAndSlug;
  try {
    const loaded = await getPractice(supabase, authorSlug, productSlug);
    if (loaded.error) return { ok: false, status: 503, reason: "storage_unavailable" };
    if (!loaded.practice) return { ok: false, status: 404, reason: "not_found" };
    return { ok: true, practice: loaded.practice, supabase };
  } catch {
    return { ok: false, status: 503, reason: "storage_unavailable" };
  }
}

export async function writeMaxPracticeListenStats(input: {
  userId: string;
  authorSlug: string;
  productSlug: string;
  audioItemId: unknown;
  positionMs: unknown;
  priorPositionMs?: unknown;
  mediaDeltaMs?: unknown;
  playbackRate?: unknown;
}): Promise<MaxListenStatsCallResult> {
  const audioItemId =
    typeof input.audioItemId === "string" ? input.audioItemId.trim() : "";
  if (!audioItemId || !AUDIO_ITEM_UUID.test(audioItemId)) {
    return { ok: false, status: 400, reason: "invalid_request" };
  }

  const positionMs = parseOptionalMs(input.positionMs);
  if (positionMs === null) {
    return { ok: false, status: 400, reason: "invalid_request" };
  }

  const priorPositionMs = parseOptionalMs(input.priorPositionMs);
  const clientMediaDeltaMs =
    parseOptionalMs(input.mediaDeltaMs) ??
    (priorPositionMs !== null ? Math.max(0, positionMs - priorPositionMs) : null);

  const playbackRate =
    typeof input.playbackRate === "number" &&
    Number.isFinite(input.playbackRate) &&
    input.playbackRate > 0
      ? input.playbackRate
      : null;

  const loaded = await loadPractice(input.authorSlug, input.productSlug);
  if (!loaded.ok) return loaded;

  const { practice, supabase } = loaded;
  const resolveAccess = listenStatsDeps?.resolveAccess ?? resolveProductAccess;
  const canAccessCourse = listenStatsDeps?.canAccessCourse ?? canAccessCourseContent;
  const resolveListen = listenStatsDeps?.resolveListen ?? resolveListenAccess;

  let productAccess;
  try {
    productAccess = await resolveAccess(supabase, practice, input.userId);
  } catch {
    return { ok: false, status: 503, reason: "storage_unavailable" };
  }

  const isCourse = isCoursePublication(
    practice.publication_class,
    practice.product_kind,
  );
  let courseAllowed = false;
  if (isCourse) {
    try {
      courseAllowed = await canAccessCourse(supabase, practice, input.userId, {
        access: productAccess,
      });
    } catch {
      return { ok: false, status: 503, reason: "storage_unavailable" };
    }
  }

  const needsListenAccess =
    (isCourse && courseAllowed) || (!isCourse && productAccess.canListen);
  let listenAccess = null;
  if (needsListenAccess) {
    try {
      listenAccess = await resolveListen(supabase, input.userId, practice);
    } catch {
      return { ok: false, status: 503, reason: "storage_unavailable" };
    }
  }

  const decision = resolveListenApiDecision({
    purpose: "listen_stats",
    isCourse,
    courseAllowed,
    canListen: productAccess.canListen,
    accessReason: productAccess.reason,
    catalogPreviewEligible: isCatalogStorefrontPreviewEligible(practice),
    listenAccess,
  });
  if (!decision.ok) return { ok: false, status: 403, reason: "forbidden" };

  const canAccrueWithAccess = canAccrueListenStats({
    userId: input.userId,
    access: decision.access,
    isCourse,
    productKind: practice.product_kind,
  });
  if (!canAccrueWithAccess) {
    return { ok: false, status: 403, reason: "forbidden" };
  }

  const { data: audioItem, error: audioError } = await supabase
    .from("audio_items")
    .select("id, status")
    .eq("id", audioItemId)
    .eq("practice_id", practice.id)
    .maybeSingle();

  if (audioError) {
    return { ok: false, status: 503, reason: "storage_unavailable" };
  }
  if (!audioItem?.id) {
    return { ok: false, status: 404, reason: "not_found" };
  }

  try {
    const applyHeartbeat =
      listenStatsDeps?.applyHeartbeat ?? applyOwnPracticeListenStatsHeartbeat;
    const body = await applyHeartbeat({
      userId: input.userId,
      practiceId: practice.id,
      audioItemId,
      positionMs,
      allowEligibility: canBecomeRatingEligible(decision.access),
      clientMediaDeltaMs,
      playbackRate,
    });
    return { ok: true, status: 200, body };
  } catch {
    return { ok: false, status: 503, reason: "storage_unavailable" };
  }
}