import { formatMimeFromAddress } from "@/lib/email/mime";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import { getSenderIdentity } from "@/lib/email/sender-identities";
import { getSmtpConfigFromEnv } from "@/lib/email/smtp-config";
import { isSafeSupportReplyToEmail } from "@/lib/help/support-validation";
import { SUPPORT_CATEGORY_LABELS, type SupportRequestCategory } from "@/lib/help/types";

export type SupportRequestNotificationPayload = {
  requestId: string;
  category: SupportRequestCategory;
  subject: string;
  message: string;
  contactName: string | null;
  contactEmail: string;
  userId: string | null;
  authorId: string | null;
  sourceUrl: string | null;
  createdAt: string;
};

export type SendSupportRequestNotificationResult =
  | { ok: true; providerMessageId?: string; toEmail: string }
  | {
      ok: false;
      code: "smtp_not_configured" | "recipient_missing" | "send_failed";
    };

const FALLBACK_SUPPORT_NOTIFICATION_EMAIL = "1@audiolad.ru";

/**
 * Recipient for support ticket notifications.
 * Prefer SUPPORT_NOTIFICATION_EMAIL; fall back to the canonical public contact.
 */
export function resolveSupportNotificationEmail(): string {
  const fromEnv =
    process.env.SUPPORT_NOTIFICATION_EMAIL?.trim() ||
    process.env.AUDIOLAD_SUPPORT_NOTIFICATION_EMAIL?.trim();

  if (fromEnv && isSafeSupportReplyToEmail(fromEnv)) {
    return fromEnv.toLowerCase();
  }

  return FALLBACK_SUPPORT_NOTIFICATION_EMAIL;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildSubject(payload: SupportRequestNotificationPayload): string {
  const categoryLabel = SUPPORT_CATEGORY_LABELS[payload.category];
  const shortId = payload.requestId.slice(0, 8);
  return `[АудиоЛад] Обращение ${shortId}: ${categoryLabel}`;
}

function buildText(payload: SupportRequestNotificationPayload): string {
  const categoryLabel = SUPPORT_CATEGORY_LABELS[payload.category];
  return [
    "Новое обращение в поддержку АудиоЛада",
    "",
    `ID: ${payload.requestId}`,
    `Категория: ${categoryLabel}`,
    `Тема: ${payload.subject}`,
    `Имя: ${payload.contactName ?? "—"}`,
    `Email: ${payload.contactEmail}`,
    `User ID: ${payload.userId ?? "—"}`,
    `Author ID: ${payload.authorId ?? "—"}`,
    `Страница: ${payload.sourceUrl ?? "—"}`,
    `Дата: ${payload.createdAt}`,
    "",
    "Сообщение:",
    payload.message,
  ].join("\n");
}

function buildHtml(payload: SupportRequestNotificationPayload): string {
  const categoryLabel = SUPPORT_CATEGORY_LABELS[payload.category];
  const rows: Array<[string, string]> = [
    ["ID", payload.requestId],
    ["Категория", categoryLabel],
    ["Тема", payload.subject],
    ["Имя", payload.contactName ?? "—"],
    ["Email", payload.contactEmail],
    ["User ID", payload.userId ?? "—"],
    ["Author ID", payload.authorId ?? "—"],
    ["Страница", payload.sourceUrl ?? "—"],
    ["Дата", payload.createdAt],
  ];

  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5f5484;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;color:#25135c">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#25135c">
<h1 style="font-size:18px">Новое обращение в поддержку</h1>
<table>${table}</table>
<p style="margin-top:20px;color:#5f5484">Сообщение</p>
<pre style="white-space:pre-wrap;font-family:inherit;background:#f7f2fc;padding:12px;border-radius:12px">${escapeHtml(payload.message)}</pre>
</body></html>`;
}

/**
 * Notify operators after a support_requests row is persisted.
 * Failures must not undo the DB insert and must not create a duplicate row.
 */
export async function sendSupportRequestNotificationEmail(
  payload: SupportRequestNotificationPayload,
): Promise<SendSupportRequestNotificationResult> {
  const toEmail = resolveSupportNotificationEmail();
  if (!toEmail) {
    console.error("support_request_notification_recipient_missing");
    return { ok: false, code: "recipient_missing" };
  }

  const smtpConfig = getSmtpConfigFromEnv();
  if (!smtpConfig) {
    console.error("support_request_notification_smtp_not_configured");
    return { ok: false, code: "smtp_not_configured" };
  }

  // Match welcome/recovery: Timeweb requires MAIL FROM = SMTP mailbox user.
  const fromEmail = smtpConfig.user.trim().toLowerCase();
  const sender = getSenderIdentity("auth_security");
  const from = formatMimeFromAddress(sender.displayName ?? "АудиоЛад", fromEmail);

  const replyTo = isSafeSupportReplyToEmail(payload.contactEmail)
    ? payload.contactEmail
    : sender.replyTo;

  const provider = createSmtpEmailProvider(smtpConfig);
  const result = await provider.send({
    from,
    envelopeFrom: fromEmail,
    replyTo,
    to: toEmail,
    subject: buildSubject(payload),
    html: buildHtml(payload),
    text: buildText(payload),
  });

  if (!result.ok) {
    console.error(
      "support_request_notification_send_failed",
      result.code,
      result.message,
    );
    return { ok: false, code: "send_failed" };
  }

  return {
    ok: true,
    providerMessageId: result.providerMessageId,
    toEmail,
  };
}
