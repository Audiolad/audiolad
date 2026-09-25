import "server-only";

import { NextResponse } from "next/server";

import { isCoursePublication } from "@/lib/course-content/validators";
import { loadListenApiContext } from "@/lib/listen/api-context";
import {
  canAccrueListenStats,
  canBecomeRatingEligible,
} from "@/lib/listen/listen-stats-access";
import { getOwnPracticeListenStats } from "@/lib/listen/listen-stats";
import { applyOwnPracticeListenStatsHeartbeat } from "@/lib/listen/listen-stats-write";
import { applyPlaybackUsageHeartbeat } from "@/lib/listen/playback-usage-write";
import type { PlaybackUsagePhase } from "@/lib/listen/playback-usage";
import { canEntitledUserAccessPracticeStatus } from "@/lib/products/access";
import { getPracticeByAuthorAndSlug } from "@/lib/products/lookup";
import { createClientFromRequest } from "@/lib/supabase/request-client";

const MAX_ANONYMOUS_ID_LENGTH = 128;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function parsePlaybackPhase(value: unknown): PlaybackUsagePhase | null {
  if (
    value === "advance" ||
    value === "seek" ||
    value === "pause" ||
    value === "ended" ||
    value === "track_change"
  ) {
    return value;
  }

  return null;
}

function parseListeningKey(
  value: unknown,
  practiceId: string,
  audioItemId: string,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const parts = trimmed.split(":");

  if (
    parts.length !== 3 ||
    parts[0] !== practiceId ||
    parts[1] !== audioItemId ||
    !/^\d+$/.test(parts[2]) ||
    trimmed.length > 200
  ) {
    return null;
  }

  return trimmed;
}

function parseOptionalMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

function parseOptionalRate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function parseOptionalAnonymousId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ANONYMOUS_ID_LENGTH) {
    return null;
  }

  return trimmed;
}

export async function handleListenStatsGet(
  request: Request,
  authorSlug: string,
  productSlug: string,
): Promise<NextResponse> {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const isMissingSessionError =
    authError?.message?.toLowerCase().includes("auth session missing") ?? false;

  if (authError && !isMissingSessionError) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { practice, error: practiceError } = await getPracticeByAuthorAndSlug(
    supabase,
    authorSlug,
    productSlug,
  );

  if (practiceError) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!practice?.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const ownState = await getOwnPracticeListenStats(
      supabase,
      user.id,
      practice.id,
    );
    return NextResponse.json(ownState);
  } catch (error) {
    console.error("listen_stats_get_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function handleListenStatsPut(
  request: Request,
  authorSlug: string,
  productSlug: string,
): Promise<NextResponse> {
  const loaded = await loadListenApiContext(request, authorSlug, productSlug, {
    purpose: "listen_stats",
  });

  if (!loaded.ok) {
    return loaded.response;
  }

  const { supabase, userId, practice, access } = loaded.context;
  const isCourse = isCoursePublication(
    practice.publication_class,
    practice.product_kind,
  );

  const accrueRating = canAccrueListenStats({
    userId,
    access,
    isCourse,
    productKind: practice.product_kind,
  });

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const audioItemId =
    "audio_item_id" in body && typeof body.audio_item_id === "string"
      ? body.audio_item_id.trim()
      : "";
  const positionMs = parseOptionalMs(
    "position_ms" in body ? body.position_ms : undefined,
  );
  const priorPositionMs = parseOptionalMs(
    "prior_position_ms" in body ? body.prior_position_ms : undefined,
  );
  const clientMediaDeltaMs = parseOptionalMs(
    "media_delta_ms" in body ? body.media_delta_ms : undefined,
  );
  const playbackRate = parseOptionalRate(
    "playback_rate" in body ? body.playback_rate : undefined,
  );
  const anonymousId = parseOptionalAnonymousId(
    "audiolad_anonymous_id" in body ? body.audiolad_anonymous_id : undefined,
  );
  const clientEventId = parseUuid(
    "client_event_id" in body ? body.client_event_id : undefined,
  );
  const sessionId = parseUuid(
    "analytics_session_id" in body ? body.analytics_session_id : undefined,
  );
  const phase = parsePlaybackPhase(
    "playback_phase" in body ? body.playback_phase : undefined,
  );
  const usageRequested =
    ("client_event_id" in body && body.client_event_id != null) ||
    ("listening_key" in body && body.listening_key != null) ||
    ("playback_phase" in body && body.playback_phase != null);

  if (!audioItemId || audioItemId.startsWith("legacy-") || positionMs === null) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data: audioItem, error: audioError } = await supabase
    .from("audio_items")
    .select("id, status")
    .eq("id", audioItemId)
    .eq("practice_id", practice.id)
    .maybeSingle();

  if (audioError) {
    console.error("listen_stats_audio_error", audioError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!audioItem?.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (
    access.mode === "entitled" &&
    (!canEntitledUserAccessPracticeStatus(practice.status) ||
      audioItem.status !== "published")
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (
    access.mode === "catalog_preview" &&
    audioItem.status !== "published"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const derivedClientDelta =
    clientMediaDeltaMs ??
    (priorPositionMs !== null ? Math.max(0, positionMs - priorPositionMs) : null);

  if (!accrueRating && !usageRequested) {
    return NextResponse.json(
      { error: userId ? "forbidden" : "unauthorized" },
      { status: userId ? 403 : 401 },
    );
  }

  const listeningKey = usageRequested
    ? parseListeningKey(
        "listening_key" in body ? body.listening_key : undefined,
        practice.id,
        audioItemId,
      )
    : null;

  if (usageRequested && (!clientEventId || !listeningKey || !phase)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    let acceptedUsageMs: number | null = null;

    if (usageRequested && clientEventId && listeningKey && phase) {
      const usage = await applyPlaybackUsageHeartbeat({
        clientEventId,
        listeningKey,
        userId,
        anonymousId,
        sessionId,
        practiceId: practice.id,
        audioItemId,
        positionMs,
        clientMediaDeltaMs: derivedClientDelta,
        playbackRate,
        phase,
      });
      acceptedUsageMs = usage.acceptedMs;
    }

    if (accrueRating && userId) {
      const ownState = await applyOwnPracticeListenStatsHeartbeat({
        userId,
        practiceId: practice.id,
        audioItemId,
        positionMs,
        allowEligibility: canBecomeRatingEligible(access),
        clientMediaDeltaMs: derivedClientDelta,
        playbackRate,
      });
      return NextResponse.json(
        acceptedUsageMs == null ? ownState : { ...ownState, acceptedUsageMs },
      );
    }

    return NextResponse.json({
      realListenedMs: 0,
      ratingEligible: false,
      ratingEligibleAt: null,
      acceptedUsageMs,
    });
  } catch (error) {
    console.error("listen_stats_put_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
