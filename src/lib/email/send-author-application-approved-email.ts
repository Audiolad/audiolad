import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthorsSendHeaders } from "@/lib/email/sender-identities";
import {
  acquireOperationalEmailDelivery,
  AUTHOR_APPLICATION_APPROVED_MESSAGE_TYPE,
  markOperationalEmailDeliveryAttempt,
  markOperationalEmailDeliveryFailed,
  markOperationalEmailDeliverySent,
} from "@/lib/email/operational-deliveries";
import { getSmtpConfigFromEnv } from "@/lib/email/smtp-config";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY,
  AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/author-application-approved";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";

export type SendAuthorApplicationApprovedEmailInput = {
  toEmail: string;
  applicationId: string;
  forceResend?: boolean;
  supabase?: SupabaseClient;
};

export type SendAuthorApplicationApprovedEmailResult =
  | { ok: true; providerMessageId?: string; skipped?: boolean }
  | {
      ok: false;
      code:
        | "already_sent"
        | "smtp_not_configured"
        | "template_render_failed"
        | "send_failed"
        | "delivery_persist_failed"
        | "invalid_input";
    };

function mapSendFailureCode(
  code: string,
): Extract<SendAuthorApplicationApprovedEmailResult, { ok: false }>["code"] {
  if (code === "smtp_not_configured") return "smtp_not_configured";
  if (code === "template_render_failed") return "template_render_failed";
  return "send_failed";
}

export async function sendAuthorApplicationApprovedEmail(
  input: SendAuthorApplicationApprovedEmailInput,
): Promise<SendAuthorApplicationApprovedEmailResult> {
  const acquired = await acquireOperationalEmailDelivery(
    {
      applicationId: input.applicationId,
      recipientEmail: input.toEmail,
      messageType: AUTHOR_APPLICATION_APPROVED_MESSAGE_TYPE,
      forceResend: input.forceResend === true,
    },
    input.supabase,
  );

  if (!acquired.ok) {
    return { ok: false, code: acquired.code };
  }

  if (!acquired.shouldSend) {
    return { ok: true, skipped: true };
  }

  const delivery = acquired.delivery;
  await markOperationalEmailDeliveryAttempt(delivery.id, input.supabase);

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY,
    templateVersion: AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION,
    payload: {},
  });

  if (!rendered.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `template_render_failed:${rendered.code}`,
      input.supabase,
    );
    console.error("author_application_approved_email_render_failed", rendered.code);
    return { ok: false, code: "template_render_failed" };
  }

  const smtpConfig = getSmtpConfigFromEnv();

  if (!smtpConfig) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      "smtp_not_configured",
      input.supabase,
    );
    console.error("author_application_approved_email_smtp_not_configured");
    return { ok: false, code: "smtp_not_configured" };
  }

  const { from, envelopeFrom, replyTo } = resolveAuthorsSendHeaders(smtpConfig.user);
  const provider = createSmtpEmailProvider(smtpConfig);

  const result = await provider.send({
    from,
    envelopeFrom,
    replyTo,
    to: input.toEmail.trim().toLowerCase(),
    subject: rendered.subject,
    html: rendered.html,
  });

  if (!result.ok) {
    const failureMessage = `${result.code}:${result.message ?? "send_failed"}`;
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      failureMessage,
      input.supabase,
    );
    console.error(
      "author_application_approved_email_send_failed",
      result.code,
      result.message,
    );
    return { ok: false, code: mapSendFailureCode(result.code) };
  }

  await markOperationalEmailDeliverySent(delivery.id, input.supabase);

  return {
    ok: true,
    providerMessageId: result.providerMessageId,
  };
}
