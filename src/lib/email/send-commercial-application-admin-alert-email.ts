import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import { getSenderIdentity } from "@/lib/email/sender-identities";
import {
  COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY,
  COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
  buildCommercialApplicationAdminAlertSubject,
  type CommercialApplicationAdminAlertKind,
} from "@/lib/email/templates/commercial-application-admin-alert";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";

export type SendCommercialApplicationAdminAlertEmailInput = {
  authorName: string;
  applicationId: string;
  kind?: CommercialApplicationAdminAlertKind;
  siteOrigin?: string;
  toEmail?: string;
};

export type SendCommercialApplicationAdminAlertEmailResult =
  | { ok: true; providerMessageId?: string; toEmail: string }
  | {
      ok: false;
      code:
        | "authors_smtp_not_configured"
        | "template_render_failed"
        | "send_failed"
        | "recipient_missing";
    };

/** Admin mailbox for author/commercial application alerts. */
export function resolveCommercialApplicationAdminAlertEmail(): string | null {
  const fromEnv = process.env.AUDIOLAD_ADMIN_APPLICATIONS_EMAIL?.trim();

  if (fromEnv) {
    return fromEnv.toLowerCase();
  }

  const authorsReplyTo = getSenderIdentity("authors").replyTo?.trim();

  if (authorsReplyTo) {
    return authorsReplyTo.toLowerCase();
  }

  return "authors@audiolad.ru";
}

/**
 * Non-fatal admin alert after a commercial application is submitted/updated.
 * Failures must not roll back the application transaction.
 */
export async function sendCommercialApplicationAdminAlertEmail(
  input: SendCommercialApplicationAdminAlertEmailInput,
): Promise<SendCommercialApplicationAdminAlertEmailResult> {
  const toEmail = (
    input.toEmail?.trim() ||
    resolveCommercialApplicationAdminAlertEmail() ||
    ""
  ).toLowerCase();

  if (!toEmail) {
    console.error("commercial_application_admin_alert_recipient_missing");
    return { ok: false, code: "recipient_missing" };
  }

  const kind = input.kind ?? "submitted";
  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY,
    templateVersion: COMMERCIAL_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
    payload: {
      authorName: input.authorName,
      applicationId: input.applicationId,
      kind,
      siteOrigin: input.siteOrigin,
    },
  });

  if (!rendered.ok) {
    console.error(
      "commercial_application_admin_alert_email_render_failed",
      rendered.code,
    );
    return { ok: false, code: "template_render_failed" };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();

  if (!deliveryContext.ok) {
    console.error(
      "commercial_application_admin_alert_authors_smtp_not_configured",
    );
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const { smtpConfig, transport } = deliveryContext.delivery;
  const provider = createSmtpEmailProvider(smtpConfig);
  const subject =
    rendered.subject ||
    buildCommercialApplicationAdminAlertSubject(input.authorName, kind);

  const result = await provider.send({
    from: transport.from,
    envelopeFrom: transport.envelopeFrom,
    replyTo: transport.replyTo,
    to: toEmail,
    subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!result.ok) {
    console.error(
      "commercial_application_admin_alert_email_send_failed",
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
