import "server-only";

import { peekAuthorExecutionContext } from "./context";
import { evaluateAuthorSupportSpaceMutationBlock } from "./policy";
import { readAuthorSupportCookie } from "./session";

/**
 * True when the current request must not change the author space slug or
 * delete the space (support mode, or support state that cannot be resolved).
 * Requests without a support cookie (ordinary authors) are never blocked.
 */
export async function isAuthorSpaceMutationBlockedForRequest(): Promise<boolean> {
  const hasSupportCookie = Boolean(await readAuthorSupportCookie());
  const context = hasSupportCookie ? await peekAuthorExecutionContext() : null;
  return evaluateAuthorSupportSpaceMutationBlock({ hasSupportCookie, context });
}
