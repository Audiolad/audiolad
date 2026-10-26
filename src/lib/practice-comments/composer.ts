export type ListenerCommentComposerMode = "form" | "sign_in" | "hidden";

/**
 * Any signed-in listener gets the review form, until they already have
 * their own review on this practice. A cached guest payload must not hide
 * the form. Guests get the sign-in prompt.
 */
export function resolveListenerCommentComposer(input: {
  isAuthenticated: boolean;
  viewerCanComment?: boolean;
  viewerAuthenticated?: boolean;
  hasOwnImpression?: boolean;
}): ListenerCommentComposerMode {
  const signedIn = input.isAuthenticated || input.viewerCanComment || input.viewerAuthenticated;
  if (!signedIn) return "sign_in";
  if (input.hasOwnImpression) return "hidden";
  return "form";
}
