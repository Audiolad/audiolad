import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  isGuestRatingsClaimCopyEnabled,
  isGuestRatingsCollectEnabled,
} from "@/lib/ratings/guest/feature";
import {
  readGuestRatingCookieValue,
  resolveGuestRatingSessionSecret,
  verifyGuestRatingSession,
} from "@/lib/ratings/guest/session";

type EnvLike = { [key: string]: string | undefined };

export type GuestRatingClaimResult = {
  claimed: number;
  superseded: number;
  linked: number;
};

type ClaimRpc = (
  fn: "claim_guest_practice_ratings",
  args: { p_guest_id: string; p_user_id: string; p_copy_to_account: boolean },
) => PromiseLike<{ data: unknown; error: unknown }>;

const defaultClaimRpc: ClaimRpc = (fn, args) =>
  createServiceRoleClient().rpc(fn, args);

const EMPTY_CLAIM: GuestRatingClaimResult = {
  claimed: 0,
  superseded: 0,
  linked: 0,
};

/**
 * After a real sign-in, bind the signed guest cookie to that account.
 * Failures are returned, never thrown, so login itself still succeeds.
 * The account id comes from the server session, not from the client.
 */
export async function claimGuestRatingsForUser(input: {
  userId: string;
  cookieHeader: string | null;
  env?: EnvLike;
  /** Test seam. Production always uses the service-role client. */
  rpc?: ClaimRpc;
}): Promise<GuestRatingClaimResult> {
  const env = input.env ?? process.env;
  // Flags off: do not read or write ratings. The guest cookie stays so a
  // later explicit enable can still link it.
  if (!isGuestRatingsCollectEnabled(env)) {
    return EMPTY_CLAIM;
  }

  const secret = resolveGuestRatingSessionSecret(env);
  if (!secret) {
    return EMPTY_CLAIM;
  }

  const session = verifyGuestRatingSession(
    readGuestRatingCookieValue(input.cookieHeader),
    secret,
    Date.now(),
  );
  if (!session) {
    return EMPTY_CLAIM;
  }

  const rpc = input.rpc ?? defaultClaimRpc;
  const { data, error } = await rpc("claim_guest_practice_ratings", {
    p_guest_id: session.guestId,
    p_user_id: input.userId,
    p_copy_to_account: isGuestRatingsClaimCopyEnabled(env),
  });

  if (error) {
    throw new Error("guest_rating_claim_failed");
  }

  const rows = (Array.isArray(data) ? data : []) as Array<{ action?: string }>;
  return {
    claimed: rows.filter((row) => row.action === "claimed").length,
    superseded: rows.filter((row) => row.action === "superseded").length,
    linked: rows.filter((row) => row.action === "linked").length,
  };
}
