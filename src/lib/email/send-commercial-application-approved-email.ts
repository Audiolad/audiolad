import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import {
  acquireOperationalEmailDelivery,
  COMMERCIAL_APPLICATION_APPROVED_MESSAGE_TYPE,
  markOperationalEmailDeliveryAttempt,
  markOperationalEmailDeliveryFailed,
  markOperationalEmailDeliverySent,
} from "@/lib/email/operational-deliveries";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY,
  COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/commercial-application-approved";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";
import { getAppOrigin } from "@/lib/seo/app-origin";

export { COMMERCIAL_APPLICATION_APPROVED_MESSAGE_TYPE };

export type SendCommercialApplicationApprovedEmailInput = {
  toEmail: string;
  applicationId: string;
  authorName?: string | null;
  siteOrigin?: string;
  forceResend?: boolean;
  supabase?: SupabaseClient;
};

export type SendCommercialApplicationApprovedEmailResult =
  | { ok: true; providerMessageId?: string; skipped?: boolean }
  | {
      ok: false;
      code:
        | "authors_smtp_not_configured"
        | "template_render_failed"
        | "send_failed"
        | "delivery_persist_failed"
        | "invalid_input";
    };

/**
 * Non-fatal author email after a commercial application is approved.
 * Deduped once per application via operational_email_deliveries.
 */
export async function sendCommercialApplicationApprovedEmail(
  input: SendCommercialApplicationApprovedEmailInput,
): Promise<SendCommercialApplicationApprovedEmailResult> {
  const applicationId = input.applicationId.trim();
  const toEmail = input.toEmail.trim().toLowerCase();

  if (!applicationId || !toEmail) {
    console.error("commercial_application_approved_email_invalid_input");
    return { ok: false, code: "invalid_input" };
  }

  const acquired = await acquireOperationalEmailDelivery(
    {
      applicationId,
      recipientEmail: toEmail,
      messageType: COMMERCIAL_APPLICATION_APPROVED_MESSAGE_TYPE,
      forceResend: input.forceResend === true,
    },
    input.supabase,
  );

  if (!acquired.ok) {
    console.error(
      "commercial_application_approved_email_delivery_persist_failed",
      acquired.code,
    );
    return { ok: false, code: acquired.code };
  }

  if (!acquired.shouldSend) {
    return { ok: true, skipped: true };
  }

  const delivery = acquired.delivery;
  await markOperationalEmailDeliveryAttempt(delivery.id, input.supabase);

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY,
    templateVersion: COMMERCIAL_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION,
    payload: {
      authorName: input.authorName ?? "",
      siteOrigin: input.siteOrigin ?? getAppOrigin(),
    },
  });

  if (!rendered.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `template_render_failed:${rendered.code}`,
      input.supabase,
    );
    console.error(
      "commercial_application_approved_email_render_failed",
      rendered.code,
    );
    return { ok: false, code: "template_render_failed" };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();

  if (!deliveryContext.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      "authors_smtp_not_configured",
      input.supabase,
    );
    console.error(
      "commercial_application_approved_email_authors_smtp_not_configured",
    );
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const { smtpConfig, transport } = deliveryContext.delivery;
  const provider = createSmtpEmailProvider(smtpConfig);

  const result = await provider.send({
    from: transport.from,
    envelopeFrom: transport.envelopeFrom,
    replyTo: transport.replyTo,
    to: toEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!result.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `${result.code}:${result.message ?? "send_failed"}`,
      input.supabase,
    );
    console.error(
      "commercial_application_approved_email_send_failed",
      result.code,
    );
    return { ok: false, code: "send_failed" };
  }

  await markOperationalEmailDeliverySent(delivery.id, input.supabase);

  console.info("commercial_application_approved_email_sent", {
    applicationId,
    providerMessageId: result.providerMessageId ?? null,
  });

  return {
    ok: true,
    providerMessageId: result.providerMessageId,
  };
}
