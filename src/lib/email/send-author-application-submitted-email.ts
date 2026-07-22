import { resolveAuthorsSendHeaders } from "@/lib/email/sender-identities";
import { getSmtpConfigFromEnv } from "@/lib/email/smtp-config";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_KEY,
  AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/author-application-submitted";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";

export type SendAuthorApplicationSubmittedEmailInput = {
  toEmail: string;
};

export type SendAuthorApplicationSubmittedEmailResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      code: "smtp_not_configured" | "template_render_failed" | "send_failed";
    };

export async function sendAuthorApplicationSubmittedEmail(
  input: SendAuthorApplicationSubmittedEmailInput,
): Promise<SendAuthorApplicationSubmittedEmailResult> {
  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_KEY,
    templateVersion: AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_VERSION,
    payload: {},
  });

  if (!rendered.ok) {
    console.error("author_application_submitted_email_render_failed", rendered.code);
    return { ok: false, code: "template_render_failed" };
  }

  const smtpConfig = getSmtpConfigFromEnv();

  if (!smtpConfig) {
    console.error("author_application_submitted_email_smtp_not_configured");
    return { ok: false, code: "smtp_not_configured" };
  }

  const { from, envelopeFrom, replyTo } = resolveAuthorsSendHeaders(smtpConfig.user);
  const provider = createSmtpEmailProvider(smtpConfig);

  const result = await provider.send({
    from,
    envelopeFrom,
    replyTo,
    to: input.toEmail,
    subject: rendered.subject,
    html: rendered.html,
  });

  if (!result.ok) {
    console.error(
      "author_application_submitted_email_send_failed",
      result.code,
      result.message,
    );
    return { ok: false, code: "send_failed" };
  }

  return {
    ok: true,
    providerMessageId: result.providerMessageId,
  };
}
