import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCoursePublication } from "@/lib/course-content/validators";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { resolveListenAccess } from "@/lib/listen/access";
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
import { evaluatePracticeRatingGate } from "@/lib/ratings/eligibility";
import {
  getOwnPracticeRatingEligibleAt,
  getOwnPracticeRatingState,
} from "@/lib/ratings/read";
import { isPracticeRatingWriteRateLimited } from "@/lib/ratings/route";
import { hmacRatingSignal } from "@/lib/ratings/signal-hmac";
import { parsePracticeRatingStars } from "@/lib/ratings/stars";
import type { PracticeRatingAggregate } from "@/lib/ratings/types";
import { applyOwnPracticeRating } from "@/lib/ratings/write";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type MaxRatingReadBody = {
  stars: number | null;
  ratingEligible: boolean;
  aggregate: PracticeRatingAggregate;
};

export type MaxRatingWriteBody = {
  stars: number;
  changed: boolean;
  aggregate: PracticeRatingAggregate;
};

export type MaxRatingCallResult =
  | { ok: true; status: 200; body: MaxRatingReadBody | MaxRatingWriteBody }
  | { ok: false; status: number; reason: string };

type RatingDeps = {
  createClient?: () => SupabaseClient;
  getPractice?: typeof getPracticeByAuthorAndSlug;
  resolveAccess?: typeof resolveProductAccess;
  canAccessCourse?: typeof canAccessCourseContent;
  resolveListen?: typeof resolveListenAccess;
  getOwnState?: typeof getOwnPracticeRatingState;
  getEligibleAt?: typeof getOwnPracticeRatingEligibleAt;
  applyRating?: typeof applyOwnPracticeRating;
};

let ratingDeps: RatingDeps | null = null;

export function setMaxRatingDepsForTests(deps: RatingDeps | null) {
  ratingDeps = deps;
}

function client() {
  return (ratingDeps?.createClient ?? createServiceRoleClient)();
}

async function loadPractice(
  authorSlug: string,
  productSlug: string,
): Promise<
  | { ok: true; practice: PublicPracticeRow; supabase: SupabaseClient }
  | { ok: false; status: number; reason: string }
> {
  const supabase = client();
  const getPractice = ratingDeps?.getPractice ?? getPracticeByAuthorAndSlug;
  try {
    const loaded = await getPractice(supabase, authorSlug, productSlug);
    if (loaded.error) return { ok: false, status: 503, reason: "storage_unavailable" };
    if (!loaded.practice) return { ok: false, status: 404, reason: "not_found" };
    return { ok: true, practice: loaded.practice, supabase };
  } catch {
    return { ok: false, status: 503, reason: "storage_unavailable" };
  }
}

export async function readMaxPracticeRating(input: {
  userId: string;
  authorSlug: string;
  productSlug: string;
}): Promise<MaxRatingCallResult> {
  const loaded = await loadPractice(input.authorSlug, input.productSlug);
  if (!loaded.ok) return loaded;
  try {
    const getOwnState = ratingDeps?.getOwnState ?? getOwnPracticeRatingState;
    const own = await getOwnState({
      supabase: loaded.supabase,
      userId: input.userId,
      practiceId: loaded.practice.id,
    });
    return {
      ok: true,
      status: 200,
      body: {
        stars: own.stars,
        ratingEligible: own.ratingEligible,
        aggregate: own.aggregate,
      },
    };
  } catch {
    return { ok: false, status: 503, reason: "storage_unavailable" };
  }
}

export async function writeMaxPracticeRating(input: {
  request: Request;
  userId: string;
  authorSlug: string;
  productSlug: string;
  stars: unknown;
}): Promise<MaxRatingCallResult> {
  const stars = parsePracticeRatingStars(input.stars);
  if (stars == null) return { ok: false, status: 400, reason: "invalid_stars" };
  if (isPracticeRatingWriteRateLimited(input.userId)) {
    return { ok: false, status: 429, reason: "rate_limited" };
  }

  const loaded = await loadPractice(input.authorSlug, input.productSlug);
  if (!loaded.ok) return loaded;
  const { practice, supabase } = loaded;
  const resolveAccess = ratingDeps?.resolveAccess ?? resolveProductAccess;
  const canAccessCourse = ratingDeps?.canAccessCourse ?? canAccessCourseContent;
  const resolveListen = ratingDeps?.resolveListen ?? resolveListenAccess;

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
    purpose: "rating",
    isCourse,
    courseAllowed,
    canListen: productAccess.canListen,
    accessReason: productAccess.reason,
    catalogPreviewEligible: isCatalogStorefrontPreviewEligible(practice),
    listenAccess,
  });
  if (!decision.ok) return { ok: false, status: 403, reason: "forbidden" };

  let ratingEligibleAt: string | null;
  try {
    const getEligibleAt = ratingDeps?.getEligibleAt ?? getOwnPracticeRatingEligibleAt;
    ratingEligibleAt = await getEligibleAt(supabase, input.userId, practice.id);
  } catch {
    return { ok: false, status: 503, reason: "storage_unavailable" };
  }

  const gate = evaluatePracticeRatingGate({
    userId: input.userId,
    access: decision.access,
    isCourse,
    productKind: practice.product_kind,
    ratingEligibleAt,
  });
  if (!gate.ok) return { ok: false, status: gate.status, reason: gate.error };

  try {
    const applyRating = ratingDeps?.applyRating ?? applyOwnPracticeRating;
    const result = await applyRating({
      userId: input.userId,
      practiceId: practice.id,
      stars,
      voteIpHmac: hmacRatingSignal("ip", getTrustedClientIp(input.request)),
      deviceIdHmac: null,
    });
    return {
      ok: true,
      status: 200,
      body: {
        stars: result.stars,
        changed: result.changed,
        aggregate: result.aggregate,
      },
    };
  } catch {
    return { ok: false, status: 503, reason: "storage_unavailable" };
  }
}
