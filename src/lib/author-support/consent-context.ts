import "server-only";

import { evaluateConsentBlock } from "./consent-guard";
import { peekAuthorExecutionContext } from "./context";
import { readAuthorSupportCookie } from "./session";

/**
 * True when the current request must NOT record a legal acceptance/consent
 * (platform-owner support mode, or support state that cannot be resolved).
 * Bearer-authenticated requests without a support cookie are not blocked.
 */
export async function isConsentBlockedForRequest(
  authenticatedUserId: string | null,
): Promise<boolean> {
  const hasSupportCookie = Boolean(await readAuthorSupportCookie());
  const context = hasSupportCookie ? await peekAuthorExecutionContext() : null;
  return evaluateConsentBlock({ hasSupportCookie, context, authenticatedUserId });
}
