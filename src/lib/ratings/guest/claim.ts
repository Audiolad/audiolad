/**
 * Linking a guest session to an account must not create a second public
 * vote. Collection off does nothing. Copying into practice_ratings is a
 * separate flag and stays off by default. Otherwise the guest row is only
 * linked to the account. An existing account vote wins and is not rewritten.
 * Rows are not deleted.
 */
export type GuestRatingClaimPlan =
  | { action: "skip"; reason: "collect_off" | "excluded" }
  | { action: "link_only" }
  | { action: "copy_to_account"; stars: number }
  | { action: "supersede_guest"; reason: "account_vote" };

export function planGuestRatingClaim(input: {
  collectEnabled: boolean;
  copyEnabled: boolean;
  guestStars: number;
  accountStars: number | null;
  /** Moderation excluded this guest vote (excluded_at is set). */
  excluded?: boolean;
}): GuestRatingClaimPlan {
  if (!input.collectEnabled) {
    return { action: "skip", reason: "collect_off" };
  }
  // Mirrors claim_guest_practice_ratings: an excluded vote is never copied,
  // superseded or linked, so it cannot reach the account or public rating.
  if (input.excluded) {
    return { action: "skip", reason: "excluded" };
  }
  if (input.accountStars != null) {
    return { action: "supersede_guest", reason: "account_vote" };
  }
  if (!input.copyEnabled) {
    return { action: "link_only" };
  }
  return { action: "copy_to_account", stars: input.guestStars };
}

/**
 * A guest row is closed for edits once it is bound to an account: either a
 * copy-claim / account vote superseded it, or a link-only claim set
 * claimed_by_user_id. Mirrors the guest_rating_claimed check in
 * set_guest_practice_rating.
 */
export function isGuestRatingRowClaimed(row: {
  superseded_at?: string | null;
  claimed_by_user_id?: string | null;
}): boolean {
  return row.superseded_at != null || row.claimed_by_user_id != null;
}

export function shouldClearGuestRatingCookie(result: {
  claimed: number;
  superseded: number;
  linked: number;
}): boolean {
  return result.claimed + result.superseded + result.linked > 0;
}

export function planGuestRatingUpdate(input: {
  previousStars: number | null;
  nextStars: number;
}): { changed: boolean; event: "first" | "changed" | null } {
  if (input.previousStars == null) {
    return { changed: true, event: "first" };
  }
  if (input.previousStars === input.nextStars) {
    return { changed: false, event: null };
  }
  return { changed: true, event: "changed" };
}
