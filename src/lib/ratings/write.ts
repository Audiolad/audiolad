import "server-only";

import { getPracticeRatingAggregate } from "@/lib/ratings/read";
import type { PracticeRatingPutState } from "@/lib/ratings/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type RatingRpcRow = {
  id: string;
  stars: number | string;
  created_at: string;
  updated_at: string;
  changed: boolean;
};

function parseStars(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Math.floor(parsed);
}

export async function applyOwnPracticeRating(input: {
  userId: string;
  practiceId: string;
  stars: number;
  voteIpHmac?: string | null;
  deviceIdHmac?: string | null;
}): Promise<PracticeRatingPutState> {
  const writer = createServiceRoleClient();
  const { data, error } = await writer.rpc("set_practice_rating", {
    p_user_id: input.userId,
    p_practice_id: input.practiceId,
    p_stars: input.stars,
    p_vote_ip_hmac: input.voteIpHmac ?? null,
    p_device_id_hmac: input.deviceIdHmac ?? null,
  });

  if (error) {
    throw new Error("rating_put_failed");
  }

  const row = Array.isArray(data)
    ? (data[0] as RatingRpcRow | undefined)
    : (data as RatingRpcRow | null);

  if (!row) {
    throw new Error("rating_put_failed");
  }

  const aggregate = await getPracticeRatingAggregate(input.practiceId, writer);

  return {
    stars: parseStars(row.stars),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    changed: row.changed === true,
    aggregate,
  };
}
