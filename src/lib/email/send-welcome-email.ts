import {
  formatSenderAddress,
  getSenderIdentity,
} from "@/lib/email/sender-identities";
import { getSmtpConfigFromEnv } from "@/lib/email/smtp-config";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  WELCOME_EMAIL_TEMPLATE_KEY,
  WELCOME_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/welcome";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";

export type SendWelcomeEmailInput = {
  toEmail: string;
  userName: string;
};

export type SendWelcomeEmailResult =
  | { ok: true }
  | { ok: false; code: "smtp_not_configured" | "template_render_failed" | "send_failed" };

export async function sendWelcomeEmail(
  input: SendWelcomeEmailInput,
): Promise<SendWelcomeEmailResult> {
  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: WELCOME_EMAIL_TEMPLATE_KEY,
    templateVersion: WELCOME_EMAIL_TEMPLATE_VERSION,
    payload: {
      userName: input.userName,
    },
  });

  if (!rendered.ok) {
    console.error("welcome_email_render_failed", rendered.code);
    return { ok: false, code: "template_render_failed" };
  }

  const smtpConfig = getSmtpConfigFromEnv();

  if (!smtpConfig) {
    console.error("welcome_email_smtp_not_configured");
    return { ok: false, code: "smtp_not_configured" };
  }

  const sender = getSenderIdentity("auth_security");
  const provider = createSmtpEmailProvider(smtpConfig);

  const result = await provider.send({
    from: formatSenderAddress(sender),
    replyTo: sender.replyTo,
    to: input.toEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!result.ok) {
    console.error("welcome_email_send_failed", result.code, result.message);
    return { ok: false, code: "send_failed" };
  }

  return { ok: true };
}
