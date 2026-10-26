export type ListenerCommentComposerMode = "form" | "sign_in";

/**
 * Any signed-in listener gets the review form.
 * A cached guest comments payload (canComment false) must not hide it.
 * Guests get the sign-in prompt.
 */
export function resolveListenerCommentComposer(input: {
  isAuthenticated: boolean;
  viewerCanComment?: boolean;
  viewerAuthenticated?: boolean;
}): ListenerCommentComposerMode {
  if (input.isAuthenticated || input.viewerCanComment || input.viewerAuthenticated) {
    return "form";
  }
  return "sign_in";
}
