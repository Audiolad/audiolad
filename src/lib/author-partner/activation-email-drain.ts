import { payloadIndicatesFirstPartnerActivation } from "@/lib/author-partner/activation-email-policy";

/**
 * Best-effort immediate send after a request that just committed a first
 * activation. This is not the retry path: a failed row with next_attempt_at
 * is claimed later by the installed audiolad-author-sale-email-outbox.timer
 * via `npm run run:author-sale-email-outbox` in the current release.
 * No-ops for registration, missing referral, and already-activated retries.
 * Failures are logged and do not change the caller result.
 */
export async function drainPartnerActivationEmailIfNeeded(
  payload: unknown,
): Promise<void> {
  if (!payloadIndicatesFirstPartnerActivation(payload)) return;

  try {
    const { processAuthorPartnerActivationEmailOutbox } = await import(
      "@/lib/email/process-author-partner-activation-email"
    );
    await processAuthorPartnerActivationEmailOutbox({ limit: 5 });
  } catch (error) {
    console.error(
      "partner_activation_email_drain_failed",
      error instanceof Error ? error.message : "unknown",
    );
  }
}
