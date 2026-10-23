/**
 * Linking a guest session to an account must not create a second public
 * vote. Collection off does nothing. Copying into practice_ratings is a
 * separate flag and stays off by default. Otherwise the guest row is only
 * linked to the account. An existing account vote wins and is not rewritten.
 * Rows are not deleted.
 */
export type GuestRatingClaimPlan =
  | { action: "skip"; reason: "collect_off" }
  | { action: "link_only" }
  | { action: "copy_to_account"; stars: number }
  | { action: "supersede_guest"; reason: "account_vote" };

export function planGuestRatingClaim(input: {
  collectEnabled: boolean;
  copyEnabled: boolean;
  guestStars: number;
  accountStars: number | null;
}): GuestRatingClaimPlan {
  if (!input.collectEnabled) {
    return { action: "skip", reason: "collect_off" };
  }
  if (input.accountStars != null) {
    return { action: "supersede_guest", reason: "account_vote" };
  }
  if (!input.copyEnabled) {
    return { action: "link_only" };
  }
  return { action: "copy_to_account", stars: input.guestStars };
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
