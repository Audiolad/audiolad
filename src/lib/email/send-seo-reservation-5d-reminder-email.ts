import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  buildSeoReservation5dReminderSubject,
  renderSeoReservation5dReminderEmailHtml,
  renderSeoReservation5dReminderEmailText,
} from "@/lib/email/templates/seo-reservation-5d-reminder";
import { formatSeoReservationExpiresAtMsk } from "@/lib/seo-queries/reservation-5d-reminder";
import { getAppOrigin } from "@/lib/seo/app-origin";

export type SendSeoReservation5dReminderEmailInput = {
  toEmail: string;
  queryText: string;
  expiresAt?: string | null;
  reservationId: string;
};

export type SendSeoReservation5dReminderEmailResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      code:
        | "authors_smtp_not_configured"
        | "invalid_input"
        | "send_failed";
    };

export async function sendSeoReservation5dReminderEmail(
  input: SendSeoReservation5dReminderEmailInput,
): Promise<SendSeoReservation5dReminderEmailResult> {
  const toEmail = input.toEmail.trim().toLowerCase();
  const queryText = input.queryText.trim();
  if (!toEmail || !queryText || !input.reservationId.trim()) {
    console.error("seo_reservation_5d_reminder_invalid_input");
    return { ok: false, code: "invalid_input" };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();
  if (!deliveryContext.ok) {
    console.error("seo_reservation_5d_reminder_authors_smtp_not_configured");
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const expiresAtLabel = input.expiresAt
    ? formatSeoReservationExpiresAtMsk(input.expiresAt)
    : null;

  const subject = buildSeoReservation5dReminderSubject();
  const templateInput = {
    queryText,
    expiresAtLabel,
    siteOrigin: getAppOrigin(),
  };
  const html = renderSeoReservation5dReminderEmailHtml(templateInput);
  const text = renderSeoReservation5dReminderEmailText(templateInput);

  const { smtpConfig, transport } = deliveryContext.delivery;
  const result = await createSmtpEmailProvider(smtpConfig).send({
    from: transport.from,
    envelopeFrom: transport.envelopeFrom,
    replyTo: transport.replyTo,
    to: toEmail,
    subject,
    html,
    text,
    headers: {
      "Message-ID": `<seo-reservation-5d-${input.reservationId}@audiolad.ru>`,
    },
  });

  if (!result.ok) {
    console.error(
      "seo_reservation_5d_reminder_send_failed",
      result.code,
      input.reservationId,
    );
    return { ok: false, code: "send_failed" };
  }

  return { ok: true, providerMessageId: result.providerMessageId };
}
