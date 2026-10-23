import "server-only";

import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { isCoursePublication } from "@/lib/course-content/validators";
import { canBecomeRatingEligible } from "@/lib/listen/listen-stats-access";
import { resolveGuestListenDurations } from "@/lib/ratings/guest/durations";
import {
  isGuestRatingsCollectEnabled,
} from "@/lib/ratings/guest/feature";
import {
  guestListenKindForAccess,
  shouldAccrueGuestListen,
} from "@/lib/ratings/guest/policy";
import {
  createGuestRatingId,
  readGuestRatingCookieValue,
  resolveGuestRatingSessionSecret,
  verifyGuestRatingSession,
  type GuestRatingSession,
} from "@/lib/ratings/guest/session";
import {
  GUEST_LISTEN_HARD_LIMIT,
  GUEST_LISTEN_HARD_WINDOW_MS,
} from "@/lib/ratings/guest/suspicion";
import { signedGuestRatingCookie, withGuestRatingCookie } from "@/lib/ratings/guest/cookie";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { NextResponse } from "next/server";

type AudioRow = {
  id: string;
  duration_seconds: number | string | null;
  preview_start_ms: number | null;
  preview_end_ms: number | null;
  status: string | null;
};

function parseSeconds(value: number | string | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readGuestSessionFromRequest(
  request: Request,
  nowMs = Date.now(),
): GuestRatingSession | null {
  const secret = resolveGuestRatingSessionSecret();
  if (!secret) {
    return null;
  }
  return verifyGuestRatingSession(
    readGuestRatingCookieValue(request.headers.get("cookie")),
    secret,
    nowMs,
  );
}

export async function applyGuestListenFromRequest(input: {
  request: Request;
  practiceId: string;
  audioItemId: string;
  positionMs: number;
  clientMediaDeltaMs: number | null;
  allowEligibility: boolean;
  accessMode: "catalog_preview" | "entitled" | "author_preview";
}): Promise<{
  responseBody: {
    realListenedMs: number;
    ratingEligible: boolean;
    ratingEligibleAt: string | null;
  };
  cookieToken: string | null;
}> {
  const nowMs = Date.now();
  const secret = resolveGuestRatingSessionSecret();
  if (!secret) {
    return {
      responseBody: {
        realListenedMs: 0,
        ratingEligible: false,
        ratingEligibleAt: null,
      },
      cookieToken: null,
    };
  }

  let session = readGuestSessionFromRequest(input.request, nowMs);
  let cookieToken: string | null = null;
  if (!session) {
    session = { guestId: createGuestRatingId(), issuedAtMs: nowMs };
    cookieToken = signedGuestRatingCookie(session.guestId, session.issuedAtMs, secret);
  }

  if (
    !checkAnalyticsRateLimit(
      `guest-listen:${session.guestId}`,
      GUEST_LISTEN_HARD_LIMIT,
      GUEST_LISTEN_HARD_WINDOW_MS,
    )
  ) {
    return {
      responseBody: {
        realListenedMs: 0,
        ratingEligible: false,
        ratingEligibleAt: null,
      },
      cookieToken,
    };
  }

  const writer = createServiceRoleClient();
  const { data: audioRows, error: audioError } = await writer
    .from("audio_items")
    .select("id, duration_seconds, preview_start_ms, preview_end_ms, status")
    .eq("practice_id", input.practiceId);

  if (audioError) {
    throw new Error("guest_listen_audio_failed");
  }

  const items = ((audioRows ?? []) as AudioRow[])
    .filter((row) => row.status === "published" || row.id === input.audioItemId)
    .map((row) => ({
      id: row.id,
      durationSeconds: parseSeconds(row.duration_seconds),
      previewStartMs: row.preview_start_ms,
      previewEndMs: row.preview_end_ms,
    }));

  const durations = resolveGuestListenDurations({
    kind: guestListenKindForAccess(input.accessMode) ?? "full",
    currentItemId: input.audioItemId,
    items,
  });

  const { data, error } = await writer.rpc("apply_guest_listen_stats_heartbeat", {
    p_guest_id: session.guestId,
    p_practice_id: input.practiceId,
    p_audio_item_id: input.audioItemId,
    p_position_ms: input.positionMs,
    p_allow_eligibility: input.allowEligibility,
    p_accessible_total_ms: durations.accessibleTotalMs,
    p_item_duration_ms: durations.itemDurationMs,
    p_client_media_delta_ms: input.clientMediaDeltaMs,
    p_now: new Date(nowMs).toISOString(),
  });

  if (error) {
    throw new Error("guest_listen_heartbeat_failed");
  }

  const row = Array.isArray(data) ? data[0] : data;
  const realListenedMs = Number(row?.real_listened_ms ?? 0);
  const ratingEligibleAt =
    typeof row?.rating_eligible_at === "string" ? row.rating_eligible_at : null;

  return {
    responseBody: {
      realListenedMs: Number.isFinite(realListenedMs) ? realListenedMs : 0,
      ratingEligible: ratingEligibleAt != null,
      ratingEligibleAt,
    },
    cookieToken,
  };
}

export function attachGuestCookie(
  response: NextResponse,
  cookieToken: string | null,
): NextResponse {
  if (!cookieToken) {
    return response;
  }
  return withGuestRatingCookie(response, cookieToken);
}

export async function maybeHandleGuestListenPut(input: {
  request: Request;
  userId: string | null;
  practiceId: string;
  productKind: string | null | undefined;
  publicationClass: string | null | undefined;
  accessMode: "catalog_preview" | "entitled" | "author_preview";
  audioItemId: string;
  positionMs: number;
  clientMediaDeltaMs: number | null;
  acceptedUsageMs: number | null;
}): Promise<NextResponse | null> {
  const isCourse = isCoursePublication(
    input.publicationClass,
    input.productKind,
  );
  if (
    !shouldAccrueGuestListen({
      collectEnabled: isGuestRatingsCollectEnabled(),
      userId: input.userId,
      isCourse,
      productKind: input.productKind,
      accessMode: input.accessMode,
    })
  ) {
    return null;
  }

  if (!canBecomeRatingEligible({ mode: input.accessMode })) {
    return null;
  }

  const applied = await applyGuestListenFromRequest({
    request: input.request,
    practiceId: input.practiceId,
    audioItemId: input.audioItemId,
    positionMs: input.positionMs,
    clientMediaDeltaMs: input.clientMediaDeltaMs,
    allowEligibility: true,
    accessMode: input.accessMode,
  });

  const body =
    input.acceptedUsageMs == null
      ? applied.responseBody
      : { ...applied.responseBody, acceptedUsageMs: input.acceptedUsageMs };
  return attachGuestCookie(NextResponse.json(body), applied.cookieToken);
}

export function guestClientIp(request: Request): string {
  return getTrustedClientIp(request);
}
