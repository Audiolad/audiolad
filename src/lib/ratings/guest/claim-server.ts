import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  readGuestRatingCookieValue,
  resolveGuestRatingSessionSecret,
  verifyGuestRatingSession,
} from "@/lib/ratings/guest/session";

export type GuestRatingClaimResult = {
  claimed: number;
  superseded: number;
};

/**
 * After a real sign-in, bind the signed guest cookie to that account.
 * Failures are returned, never thrown, so login itself still succeeds.
 * The account id comes from the server session, not from the client.
 */
export async function claimGuestRatingsForUser(input: {
  userId: string;
  cookieHeader: string | null;
}): Promise<GuestRatingClaimResult> {
  const secret = resolveGuestRatingSessionSecret();
  if (!secret) {
    return { claimed: 0, superseded: 0 };
  }

  const session = verifyGuestRatingSession(
    readGuestRatingCookieValue(input.cookieHeader),
    secret,
    Date.now(),
  );
  if (!session) {
    return { claimed: 0, superseded: 0 };
  }

  const writer = createServiceRoleClient();
  const { data, error } = await writer.rpc("claim_guest_practice_ratings", {
    p_guest_id: session.guestId,
    p_user_id: input.userId,
  });

  if (error) {
    throw new Error("guest_rating_claim_failed");
  }

  const rows = (Array.isArray(data) ? data : []) as Array<{ action?: string }>;
  return {
    claimed: rows.filter((row) => row.action === "claimed").length,
    superseded: rows.filter((row) => row.action === "superseded").length,
  };
}
