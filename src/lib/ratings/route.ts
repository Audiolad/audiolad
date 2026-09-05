import "server-only";

import { NextResponse } from "next/server";

import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { isCoursePublication } from "@/lib/course-content/validators";
import { loadListenApiContext } from "@/lib/listen/api-context";
import { getPracticeByAuthorAndSlug } from "@/lib/products/lookup";
import { readAnonymousIdFromRequest } from "@/lib/ratings/anonymous-id";
import { evaluatePracticeRatingGate } from "@/lib/ratings/eligibility";
import {
  getOwnPracticeRatingEligibleAt,
  getOwnPracticeRatingState,
} from "@/lib/ratings/read";
import { hmacRatingSignal } from "@/lib/ratings/signal-hmac";
import { parsePracticeRatingStars } from "@/lib/ratings/stars";
import { applyOwnPracticeRating } from "@/lib/ratings/write";
import { createClientFromRequest } from "@/lib/supabase/request-client";

const RATING_PUT_LIMIT = 30;
const RATING_PUT_WINDOW_MS = 60_000;

export async function handlePracticeRatingGet(
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
    const ownState = await getOwnPracticeRatingState({
      supabase,
      userId: user.id,
      practiceId: practice.id,
    });
    return NextResponse.json(ownState);
  } catch (error) {
    console.error("practice_rating_get_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function handlePracticeRatingPut(
  request: Request,
  authorSlug: string,
  productSlug: string,
): Promise<NextResponse> {
  const loaded = await loadListenApiContext(request, authorSlug, productSlug, {
    purpose: "rating",
  });

  if (!loaded.ok) {
    return loaded.response;
  }

  const { supabase, userId, practice, access } = loaded.context;

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (
    !checkAnalyticsRateLimit(
      `practice-rating:${userId}`,
      RATING_PUT_LIMIT,
      RATING_PUT_WINDOW_MS,
    )
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const stars = parsePracticeRatingStars(
    "stars" in body ? body.stars : undefined,
  );

  if (stars == null) {
    return NextResponse.json({ error: "invalid_stars" }, { status: 400 });
  }

  const isCourse = isCoursePublication(
    practice.publication_class,
    practice.product_kind,
  );
  const isAuthorOwner =
    access.mode === "author_preview" || userId === practice.author_id;

  let ratingEligibleAt: string | null;

  try {
    ratingEligibleAt = await getOwnPracticeRatingEligibleAt(
      supabase,
      userId,
      practice.id,
    );
  } catch (error) {
    console.error("practice_rating_eligibility_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const gate = evaluatePracticeRatingGate({
    userId,
    access,
    isCourse,
    productKind: practice.product_kind,
    isAuthorOwner,
    ratingEligibleAt,
  });

  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const anonymousId = readAnonymousIdFromRequest(
    request,
    "audiolad_anonymous_id" in body ? body.audiolad_anonymous_id : undefined,
  );

  try {
    const result = await applyOwnPracticeRating({
      userId,
      practiceId: practice.id,
      stars,
      voteIpHmac: hmacRatingSignal("ip", getTrustedClientIp(request)),
      deviceIdHmac: hmacRatingSignal("device", anonymousId),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("practice_rating_put_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
