import { BUSINESS_EMAIL_SENDER_NAME } from "@/lib/email/templates/business-layout";
import { formatMimeFromAddress } from "@/lib/email/mime";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import { getSenderIdentity } from "@/lib/email/sender-identities";
import { getSmtpConfigFromEnv } from "@/lib/email/smtp-config";
import {
  businessAccessReminderEndsLabel,
  businessAccessReminderGraceEndsLabel,
  businessAccessReminderSubject,
  renderBusinessAccessReminderEmailHtml,
  renderBusinessAccessReminderEmailText,
} from "@/lib/email/templates/business-access-reminder";
import type { BusinessAccessReminderKind } from "@/lib/business/access-reminders";

export type SendBusinessAccessReminderEmailInput = {
  toEmail: string;
  kind: BusinessAccessReminderKind;
  periodEnd: string;
  sendId: string;
};

export type SendBusinessAccessReminderEmailResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      code: "smtp_not_configured" | "invalid_input" | "send_failed";
    };

/**
 * Service letter to the business owner.
 * The visible From name is «АудиоЛад Бизнес». The envelope stays the existing
 * service mailbox: Timeweb only accepts that address as MAIL FROM.
 * Reply-to stays the support mailbox. No unsubscribe link.
 * Callers must already have dropped service_notifications = false and
 * all / all_non_critical stops.
 */
export async function sendBusinessAccessReminderEmail(
  input: SendBusinessAccessReminderEmailInput,
): Promise<SendBusinessAccessReminderEmailResult> {
  const toEmail = input.toEmail.trim();
  const endsAtLabel = businessAccessReminderEndsLabel(input.periodEnd);
  const graceEndsLabel = businessAccessReminderGraceEndsLabel(input.periodEnd);
  if (!toEmail.includes("@") || !endsAtLabel || !graceEndsLabel || !input.sendId.trim()) {
    console.error("business_access_reminder_invalid_input");
    return { ok: false, code: "invalid_input" };
  }

  const smtpConfig = getSmtpConfigFromEnv();
  if (!smtpConfig) {
    console.error("business_access_reminder_smtp_not_configured");
    return { ok: false, code: "smtp_not_configured" };
  }

  const templateInput = { kind: input.kind, endsAtLabel, graceEndsLabel };
  const subject = businessAccessReminderSubject(input.kind);
  const html = renderBusinessAccessReminderEmailHtml(templateInput);
  const text = renderBusinessAccessReminderEmailText(templateInput);

  const fromEmail = smtpConfig.user.trim().toLowerCase();
  const sender = getSenderIdentity("auth_security");
  const result = await createSmtpEmailProvider(smtpConfig).send({
    from: formatMimeFromAddress(BUSINESS_EMAIL_SENDER_NAME, fromEmail),
    envelopeFrom: fromEmail,
    replyTo: sender.replyTo,
    to: toEmail,
    subject,
    html,
    text,
    headers: {
      "Message-ID": `<business-access-${input.sendId}@audiolad.ru>`,
    },
  });

  if (!result.ok) {
    console.error("business_access_reminder_send_failed", result.code, input.sendId);
    return { ok: false, code: "send_failed" };
  }

  return { ok: true, providerMessageId: result.providerMessageId };
}
