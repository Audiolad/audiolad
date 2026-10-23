/**
 * Linking a guest session to an account must not create a second public
 * vote. The account vote wins when it already exists. Otherwise the guest
 * stars are copied once into practice_ratings and the guest row is marked
 * superseded so it leaves the guest aggregate. Rows are not deleted.
 */
export type GuestRatingClaimPlan =
  | { action: "copy_to_account"; stars: number }
  | { action: "supersede_guest"; reason: "account_vote" };

export function planGuestRatingClaim(input: {
  guestStars: number;
  accountStars: number | null;
}): GuestRatingClaimPlan {
  if (input.accountStars != null) {
    return { action: "supersede_guest", reason: "account_vote" };
  }
  return { action: "copy_to_account", stars: input.guestStars };
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
