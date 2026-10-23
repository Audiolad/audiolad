import "server-only";

import { NextResponse } from "next/server";

import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { canBecomeRatingEligible } from "@/lib/listen/listen-stats-access";
import type { ListenAccess } from "@/lib/listen/types";
import {
  verifyGuestCaptchaToken,
  guestCaptchaSiteKey,
  type CaptchaVerifyResult,
} from "@/lib/ratings/guest/captcha";
import {
  guestRatingsCaptchaProvider,
  isGuestRatingsCollectEnabled,
  isGuestRatingsIncludedInPublicAggregate,
  isGuestRatingsPublicEnabled,
} from "@/lib/ratings/guest/feature";
import { decideGuestRatingWrite } from "@/lib/ratings/guest/policy";
import { shouldAccrueGuestListen } from "@/lib/ratings/guest/policy";
import {
  getGuestOnlyPracticeRatingAggregate,
  getRegisteredPracticeRatingAggregate,
} from "@/lib/ratings/read";
import { readAnonymousIdFromRequest } from "@/lib/ratings/anonymous-id";
import { hmacRatingSignal } from "@/lib/ratings/signal-hmac";
import { parsePracticeRatingStars } from "@/lib/ratings/stars";
import { resolveGuestRatingSessionSecret } from "@/lib/ratings/guest/session";
import { readGuestSessionFromRequest } from "@/lib/ratings/guest/listen-server";
import {
  decideGuestCaptcha,
  guestCaptchaFailureAgeMs,
  GUEST_RATING_HARD_LIMIT,
  GUEST_RATING_HARD_WINDOW_MS,
} from "@/lib/ratings/guest/suspicion";
import { resolveDisplayedRatingAggregates } from "@/lib/ratings/guest/aggregate";
import { EMPTY_RATING_AGGREGATE, type PracticeRatingAggregate } from "@/lib/ratings/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type GuestRatingRow = {
  stars: number | string;
  created_at: string;
  updated_at: string;
  superseded_at: string | null;
};

type ListenRow = {
  rating_eligible_at: string | null;
};

function parseStars(value: number | string | null | undefined): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }
  return parsed;
}

async function displayedAggregates(practiceId: string): Promise<{
  aggregate: PracticeRatingAggregate;
  guestAggregate: PracticeRatingAggregate | null;
}> {
  const registered = await getRegisteredPracticeRatingAggregate(practiceId);
  let guest = EMPTY_RATING_AGGREGATE;
  if (isGuestRatingsPublicEnabled() || isGuestRatingsIncludedInPublicAggregate()) {
    try {
      guest = await getGuestOnlyPracticeRatingAggregate(practiceId);
    } catch {
      guest = EMPTY_RATING_AGGREGATE;
    }
  }
  return resolveDisplayedRatingAggregates({
    registered,
    guest,
    includeInPublic: isGuestRatingsIncludedInPublicAggregate(),
    showGuestSeparately: isGuestRatingsPublicEnabled(),
  });
}

function captchaPayload(mode: "invisible" | "visible" | "none") {
  if (mode === "none") return null;
  const provider = guestRatingsCaptchaProvider();
  return {
    mode,
    provider,
    siteKey: guestCaptchaSiteKey() ?? "",
  };
}

export async function handleGuestPracticeRatingGet(input: {
  request: Request;
  practiceId: string;
  access: ListenAccess | null;
  isCourse: boolean;
  productKind: string | null | undefined;
}): Promise<NextResponse> {
  if (!isGuestRatingsCollectEnabled()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const session = readGuestSessionFromRequest(input.request);
  const eligibleAccess =
    !input.isCourse &&
    input.access != null &&
    canBecomeRatingEligible(input.access) &&
    shouldAccrueGuestListen({
      collectEnabled: true,
      userId: null,
      isCourse: input.isCourse,
      productKind: input.productKind,
      accessMode: input.access.mode,
    });

  let stars: number | null = null;
  let createdAt: string | null = null;
  let updatedAt: string | null = null;
  let ratingEligible = false;
  let votesIn10Min = 0;
  let votesIn60Min = 0;
  let captchaFailures = 0;
  let captchaFailureAt: string | null = null;

  if (session && eligibleAccess) {
    const writer = createServiceRoleClient();
    const [ratingResult, listenResult, recent, activity] = await Promise.all([
      writer
        .from("guest_practice_ratings")
        .select("stars, created_at, updated_at, superseded_at")
        .eq("guest_id", session.guestId)
        .eq("practice_id", input.practiceId)
        .maybeSingle(),
      writer
        .from("guest_listen_stats")
        .select("rating_eligible_at")
        .eq("guest_id", session.guestId)
        .eq("practice_id", input.practiceId)
        .maybeSingle(),
      writer
        .from("guest_practice_rating_events")
        .select("occurred_at")
        .eq("guest_id", session.guestId)
        .gte("occurred_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
      writer
        .from("guest_rating_activity")
        .select("captcha_failures, last_captcha_failure_at")
        .eq("guest_id", session.guestId)
        .maybeSingle(),
    ]);

    if (ratingResult.error || listenResult.error || recent.error || activity.error) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const row = ratingResult.data as GuestRatingRow | null;
    if (row && row.superseded_at == null) {
      stars = parseStars(row.stars);
      createdAt = row.created_at;
      updatedAt = row.updated_at;
    }
    const listen = listenResult.data as ListenRow | null;
    ratingEligible = listen?.rating_eligible_at != null;
    const events = (recent.data ?? []) as Array<{ occurred_at: string }>;
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    votesIn10Min = events.filter((event) => Date.parse(event.occurred_at) >= tenMinAgo).length;
    votesIn60Min = events.length;
    const activityRow = activity.data as {
      captcha_failures?: number;
      last_captcha_failure_at?: string | null;
    } | null;
    captchaFailures = Number(activityRow?.captcha_failures ?? 0);
    captchaFailureAt = activityRow?.last_captcha_failure_at ?? null;
  }

  let aggregates: {
    aggregate: PracticeRatingAggregate;
    guestAggregate: PracticeRatingAggregate | null;
  };
  try {
    aggregates = await displayedAggregates(input.practiceId);
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const captcha = session
    ? decideGuestCaptcha({
        cookieAgeMs: Date.now() - session.issuedAtMs,
        votesIn10Min,
        votesIn60Min,
        captchaFailures,
        captchaFailureAgeMs: guestCaptchaFailureAgeMs(captchaFailureAt, Date.now()),
        newGuestsOnNetwork24h: null,
      })
    : { mode: "none" as const, reason: null };

  return NextResponse.json({
    stars,
    createdAt,
    updatedAt,
    ratingEligible: Boolean(session) && eligibleAccess && ratingEligible,
    aggregate: aggregates.aggregate,
    guestAggregate: aggregates.guestAggregate,
    captcha: captchaPayload(captcha.mode),
  });
}

export async function handleGuestPracticeRatingPut(input: {
  request: Request;
  practiceId: string;
  access: ListenAccess | null;
  isCourse: boolean;
  productKind: string | null | undefined;
  body: unknown;
}): Promise<NextResponse> {
  const secretConfigured = resolveGuestRatingSessionSecret() != null;
  const session = readGuestSessionFromRequest(input.request);
  const stars = parsePracticeRatingStars(
    input.body && typeof input.body === "object" && "stars" in input.body
      ? input.body.stars
      : undefined,
  );
  const eligibleAccess = shouldAccrueGuestListen({
    collectEnabled: isGuestRatingsCollectEnabled(),
    userId: null,
    isCourse: input.isCourse,
    productKind: input.productKind,
    accessMode: input.access?.mode ?? null,
  });

  const writer = secretConfigured && session ? createServiceRoleClient() : null;
  let eligible = false;
  let claimed = false;
  let votesIn10Min = 0;
  let votesIn60Min = 0;
  let captchaFailures = 0;
  let captchaFailureAt: string | null = null;
  let newGuests: number | null = null;

  if (writer && session && eligibleAccess && input.access && canBecomeRatingEligible(input.access)) {
    const ipHmac = hmacRatingSignal("ip", getTrustedClientIp(input.request));
    const [listenResult, ratingResult, recent, activity] = await Promise.all([
      writer
        .from("guest_listen_stats")
        .select("rating_eligible_at")
        .eq("guest_id", session.guestId)
        .eq("practice_id", input.practiceId)
        .maybeSingle(),
      writer
        .from("guest_practice_ratings")
        .select("superseded_at")
        .eq("guest_id", session.guestId)
        .eq("practice_id", input.practiceId)
        .maybeSingle(),
      writer
        .from("guest_practice_rating_events")
        .select("occurred_at")
        .eq("guest_id", session.guestId)
        .gte("occurred_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
      writer
        .from("guest_rating_activity")
        .select("captcha_failures, last_captcha_failure_at")
        .eq("guest_id", session.guestId)
        .maybeSingle(),
    ]);

    if (listenResult.error || ratingResult.error || recent.error || activity.error) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    eligible = (listenResult.data as ListenRow | null)?.rating_eligible_at != null;
    claimed = (ratingResult.data as { superseded_at?: string | null } | null)?.superseded_at != null;
    const events = (recent.data ?? []) as Array<{ occurred_at: string }>;
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    votesIn10Min = events.filter((event) => Date.parse(event.occurred_at) >= tenMinAgo).length;
    votesIn60Min = events.length;
    const activityRow = activity.data as {
      captcha_failures?: number;
      last_captcha_failure_at?: string | null;
    } | null;
    captchaFailures = Number(activityRow?.captcha_failures ?? 0);
    captchaFailureAt = activityRow?.last_captcha_failure_at ?? null;

    if (ipHmac) {
      const { error: networkError } = await writer
        .from("guest_rating_network_guests")
        .upsert(
          { ip_hmac: ipHmac, guest_id: session.guestId },
          { onConflict: "ip_hmac,guest_id", ignoreDuplicates: true },
        );
      if (networkError) {
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: networkRows, error: countError } = await writer
        .from("guest_rating_network_guests")
        .select("guest_id")
        .eq("ip_hmac", ipHmac)
        .gte("first_seen_at", since);
      if (countError) {
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
      newGuests = new Set(
        ((networkRows ?? []) as Array<{ guest_id: string }>).map((row) => row.guest_id),
      ).size;
    }
  }

  const captcha = decideGuestCaptcha({
    cookieAgeMs: session ? Date.now() - session.issuedAtMs : 0,
    votesIn10Min,
    votesIn60Min,
    captchaFailures,
    captchaFailureAgeMs: guestCaptchaFailureAgeMs(captchaFailureAt, Date.now()),
    newGuestsOnNetwork24h: newGuests,
  });

  const hardRateLimited = session
    ? !checkAnalyticsRateLimit(
        `guest-rating:${session.guestId}`,
        GUEST_RATING_HARD_LIMIT,
        GUEST_RATING_HARD_WINDOW_MS,
      )
    : false;

  const writeInput = {
    collectEnabled: isGuestRatingsCollectEnabled(),
    sessionPresent: session != null,
    sessionSecretConfigured: secretConfigured,
    starsValid: stars != null,
    eligible: eligible && eligibleAccess,
    claimed,
    hardRateLimited,
    captcha,
  };

  // Eligibility, the session, and the rate limit are decided before a token
  // is consumed. An ineligible guest does not burn a one-time token.
  const preliminary = decideGuestRatingWrite({
    ...writeInput,
    captchaResult: null,
  });

  let captchaResult: CaptchaVerifyResult | null = null;
  if (!preliminary.ok && preliminary.error === "captcha_required" && session) {
    const token =
      input.body && typeof input.body === "object" && "captchaToken" in input.body
        ? input.body.captchaToken
        : null;
    captchaResult = await verifyGuestCaptchaToken({
      token: typeof token === "string" ? token : null,
      ip: getTrustedClientIp(input.request),
      consumeToken: async (tokenHash) => {
        const db = createServiceRoleClient();
        const { error } = await db.from("guest_captcha_tokens").insert({
          token_hash: tokenHash,
          guest_id: session.guestId,
          provider: guestRatingsCaptchaProvider(),
        });
        if (!error) return "fresh" as const;
        if (error.code === "23505") return "reused" as const;
        throw new Error("captcha_consume_failed");
      },
    });
  }

  const decision =
    captchaResult == null
      ? preliminary
      : decideGuestRatingWrite({
          ...writeInput,
          captchaResult,
        });

  if (!decision.ok) {
    if (decision.error === "captcha_invalid" && session) {
      const db = createServiceRoleClient();
      const { error: failureError } = await db.rpc("record_guest_captcha_failure", {
        p_guest_id: session.guestId,
      });
      if (failureError) {
        console.error("guest_captcha_failure_record_error", failureError.message);
      }
    }
    return NextResponse.json(
      {
        error: decision.error,
        ...(decision.captchaMode ? { captcha: captchaPayload(decision.captchaMode) } : {}),
      },
      { status: decision.status },
    );
  }

  if (!session || stars == null) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const db = createServiceRoleClient();
  const { data, error } = await db.rpc("set_guest_practice_rating", {
    p_guest_id: session.guestId,
    p_practice_id: input.practiceId,
    p_stars: stars,
    p_verification: decision.verification,
    p_ip_hmac: hmacRatingSignal("ip", getTrustedClientIp(input.request)),
    p_device_id_hmac: hmacRatingSignal(
      "device",
      readAnonymousIdFromRequest(
        input.request,
        input.body && typeof input.body === "object" && "audiolad_anonymous_id" in input.body
          ? input.body.audiolad_anonymous_id
          : undefined,
      ),
    ),
    p_captcha_provider:
      decision.verification === "listen_captcha" ? guestRatingsCaptchaProvider() : null,
  });

  if (error) {
    if (error.message?.includes("guest_rating_not_eligible")) {
      return NextResponse.json({ error: "rating_not_eligible" }, { status: 403 });
    }
    if (error.message?.includes("guest_rating_claimed")) {
      return NextResponse.json({ error: "guest_rating_claimed" }, { status: 409 });
    }
    console.error("guest_rating_put_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    stars: number | string;
    created_at: string;
    updated_at: string;
    changed: boolean;
  } | null;
  if (!row) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (captchaFailures > 0 || decision.verification === "listen_captcha") {
    const { error: resetError } = await db.rpc("reset_guest_captcha_failures", {
      p_guest_id: session.guestId,
    });
    if (resetError) {
      console.error("guest_captcha_failure_reset_error", resetError.message);
    }
  }

  let aggregates: {
    aggregate: PracticeRatingAggregate;
    guestAggregate: PracticeRatingAggregate | null;
  };
  try {
    aggregates = await displayedAggregates(input.practiceId);
  } catch {
    aggregates = { aggregate: EMPTY_RATING_AGGREGATE, guestAggregate: null };
  }

  return NextResponse.json({
    stars: parseStars(row.stars) ?? stars,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    changed: row.changed === true,
    aggregate: aggregates.aggregate,
    guestAggregate: aggregates.guestAggregate,
  });
}
