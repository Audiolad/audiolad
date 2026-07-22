import { getSenderIdentity } from "@/lib/email/sender-identities";
import { formatMimeFromAddress } from "@/lib/email/mime";
import { getSmtpConfigFromEnv } from "@/lib/email/smtp-config";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_KEY,
  AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/author-access-granted";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";

const sentAuthorAccessGrantedEmails = new Set<string>();

export type SendAuthorAccessGrantedEmailInput = {
  toEmail: string;
  userName: string;
  applicationId: string;
};

export type SendAuthorAccessGrantedEmailResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      code:
        | "already_sent"
        | "smtp_not_configured"
        | "template_render_failed"
        | "send_failed";
    };

export async function sendAuthorAccessGrantedEmail(
  input: SendAuthorAccessGrantedEmailInput,
): Promise<SendAuthorAccessGrantedEmailResult> {
  const dedupeKey = input.applicationId.trim();

  if (!dedupeKey) {
    return { ok: false, code: "template_render_failed" };
  }

  if (sentAuthorAccessGrantedEmails.has(dedupeKey)) {
    return { ok: false, code: "already_sent" };
  }

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_KEY,
    templateVersion: AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_VERSION,
    payload: {
      userName: input.userName,
    },
  });

  if (!rendered.ok) {
    console.error("author_access_granted_email_render_failed", rendered.code);
    return { ok: false, code: "template_render_failed" };
  }

  const smtpConfig = getSmtpConfigFromEnv();

  if (!smtpConfig) {
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
    console.error(
      "author_access_granted_email_send_failed",
      result.code,
      result.message,
    );
    return { ok: false, code: "send_failed" };
  }

  sentAuthorAccessGrantedEmails.add(dedupeKey);

  return {
    ok: true,
    providerMessageId: result.providerMessageId,
  };
}

/** Test helper */
export function resetAuthorAccessGrantedEmailDedupeForTests() {
  sentAuthorAccessGrantedEmails.clear();
}
