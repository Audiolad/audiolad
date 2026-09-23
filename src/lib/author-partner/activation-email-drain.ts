import { payloadIndicatesFirstPartnerActivation } from "@/lib/author-partner/activation-email-policy";

/**
 * After a request that just committed a first activation, drain the outbox.
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
