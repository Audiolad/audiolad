import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { aggregateActivePracticeRatings } from "@/lib/ratings/aggregate";
import { isActiveRatingEligibleAt } from "@/lib/ratings/eligibility";
import {
  EMPTY_RATING_AGGREGATE,
  type PracticeRatingAggregate,
  type PracticeRatingOwnState,
} from "@/lib/ratings/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RatingRow = {
  stars: number | string;
  created_at: string;
  updated_at: string;
};

type EligibleRow = {
  rating_eligible_at: string | null;
};

function parseCount(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }

  return 0;
}

function parseStars(value: number | string | null | undefined): number | null {
  const parsed = parseCount(value);
  if (parsed < 1 || parsed > 5) {
    return null;
  }

  return parsed;
}

export async function getPracticeRatingAggregate(
  practiceId: string,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<PracticeRatingAggregate> {
  const { data, error } = await client
    .from("practice_ratings")
    .select("stars")
    .eq("practice_id", practiceId)
    .is("excluded_at", null);

  if (error) {
    throw new Error("rating_aggregate_failed");
  }

  const rows = (data ?? []) as Array<{ stars: number | string }>;
  if (rows.length === 0) {
    return EMPTY_RATING_AGGREGATE;
  }

  return aggregateActivePracticeRatings(
    rows.map((row) => ({ stars: parseCount(row.stars) })),
  );
}

export async function getOwnPracticeRating(
  supabase: SupabaseClient,
  userId: string,
  practiceId: string,
): Promise<{ stars: number | null; createdAt: string | null; updatedAt: string | null }> {
  const { data, error } = await supabase
    .from("practice_ratings")
    .select("stars, created_at, updated_at")
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (error) {
    throw new Error("rating_get_failed");
  }

  const row = data as RatingRow | null;
  if (!row) {
    return { stars: null, createdAt: null, updatedAt: null };
  }

  return {
    stars: parseStars(row.stars),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOwnPracticeRatingEligibleAt(
  supabase: SupabaseClient,
  userId: string,
  practiceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("practice_listen_stats")
    .select("rating_eligible_at")
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (error) {
    throw new Error("rating_eligibility_get_failed");
  }

  const row = data as EligibleRow | null;
  return row?.rating_eligible_at ?? null;
}

export async function getOwnPracticeRatingState(input: {
  supabase: SupabaseClient;
  userId: string;
  practiceId: string;
  ratingEligibleAt?: string | null;
}): Promise<PracticeRatingOwnState> {
  const [own, aggregate, ratingEligibleAt] = await Promise.all([
    getOwnPracticeRating(input.supabase, input.userId, input.practiceId),
    getPracticeRatingAggregate(input.practiceId),
    input.ratingEligibleAt !== undefined
      ? Promise.resolve(input.ratingEligibleAt)
      : getOwnPracticeRatingEligibleAt(
          input.supabase,
          input.userId,
          input.practiceId,
        ),
  ]);

  return {
    stars: own.stars,
    createdAt: own.createdAt,
    updatedAt: own.updatedAt,
    ratingEligible: isActiveRatingEligibleAt(ratingEligibleAt),
    aggregate,
  };
}
