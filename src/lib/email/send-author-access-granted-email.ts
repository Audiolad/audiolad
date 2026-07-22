import type { SupabaseClient } from "@supabase/supabase-js";

import { getSenderIdentity } from "@/lib/email/sender-identities";
import { formatMimeFromAddress } from "@/lib/email/mime";
import {
  acquireOperationalEmailDelivery,
  markOperationalEmailDeliveryAttempt,
  markOperationalEmailDeliveryFailed,
  markOperationalEmailDeliverySent,
} from "@/lib/email/operational-deliveries";
import { getSmtpConfigFromEnv } from "@/lib/email/smtp-config";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_KEY,
  AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/author-access-granted";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";

export type SendAuthorAccessGrantedEmailInput = {
  toEmail: string;
  userName: string;
  applicationId: string;
  forceResend?: boolean;
  supabase?: SupabaseClient;
};

export type SendAuthorAccessGrantedEmailResult =
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
): Extract<
  SendAuthorAccessGrantedEmailResult,
  { ok: false }
>["code"] {
  if (code === "smtp_not_configured") return "smtp_not_configured";
  if (code === "template_render_failed") return "template_render_failed";
  return "send_failed";
}

export async function sendAuthorAccessGrantedEmail(
  input: SendAuthorAccessGrantedEmailInput,
): Promise<SendAuthorAccessGrantedEmailResult> {
  const acquired = await acquireOperationalEmailDelivery(
    {
      applicationId: input.applicationId,
      recipientEmail: input.toEmail,
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
    templateKey: AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_KEY,
    templateVersion: AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_VERSION,
    payload: {
      userName: input.userName,
    },
  });

  if (!rendered.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `template_render_failed:${rendered.code}`,
      input.supabase,
    );
    console.error("author_access_granted_email_render_failed", rendered.code);
    return { ok: false, code: "template_render_failed" };
  }

  const smtpConfig = getSmtpConfigFromEnv();

  if (!smtpConfig) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      "smtp_not_configured",
      input.supabase,
    );
    console.error("author_access_granted_email_smtp_not_configured");
    return { ok: false, code: "smtp_not_configured" };
  }

  const fromEmail = smtpConfig.user.trim().toLowerCase();
  const sender = getSenderIdentity("authors");
  const from = formatMimeFromAddress(sender.displayName ?? "АудиоЛад", fromEmail);
  const provider = createSmtpEmailProvider(smtpConfig);

  const result = await provider.send({
    from,
    envelopeFrom: fromEmail,
    replyTo: sender.replyTo,
    to: input.toEmail,
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
      "author_access_granted_email_send_failed",
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
