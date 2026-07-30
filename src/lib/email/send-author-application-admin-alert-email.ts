import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import {
  acquireOperationalEmailDelivery,
  AUTHOR_APPLICATION_SUBMITTED_ADMIN_MESSAGE_TYPE,
  markOperationalEmailDeliveryAttempt,
  markOperationalEmailDeliveryFailed,
  markOperationalEmailDeliverySent,
} from "@/lib/email/operational-deliveries";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY,
  AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
  buildAuthorApplicationAdminAlertSubject,
} from "@/lib/email/templates/author-application-admin-alert";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";

const AUTHOR_APPLICATION_ADMIN_EMAIL = "authors@audiolad.ru";

export type SendAuthorApplicationAdminAlertEmailInput = {
  applicationId: string;
  displayName: string;
  contactEmail: string;
  contactDetails: string;
  direction: string;
  submittedAt: string;
  supabase?: SupabaseClient;
};

export type SendAuthorApplicationAdminAlertEmailResult =
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

function formatSubmittedAt(submittedAt: string): string {
  const date = new Date(submittedAt);

  if (Number.isNaN(date.getTime())) {
    return submittedAt;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export async function sendAuthorApplicationAdminAlertEmail(
  input: SendAuthorApplicationAdminAlertEmailInput,
): Promise<SendAuthorApplicationAdminAlertEmailResult> {
  const acquired = await acquireOperationalEmailDelivery(
    {
      applicationId: input.applicationId,
      recipientEmail: AUTHOR_APPLICATION_ADMIN_EMAIL,
      messageType: AUTHOR_APPLICATION_SUBMITTED_ADMIN_MESSAGE_TYPE,
      submissionAttempt: input.submittedAt,
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
    templateKey: AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_KEY,
    templateVersion: AUTHOR_APPLICATION_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION,
    payload: {
      applicationId: input.applicationId,
      displayName: input.displayName,
      contactEmail: input.contactEmail,
      contactDetails: input.contactDetails,
      direction: input.direction,
      submittedAtLabel: formatSubmittedAt(input.submittedAt),
    },
  });

  if (!rendered.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `template_render_failed:${rendered.code}`,
      input.supabase,
    );
    console.error("author_application_admin_alert_render_failed", rendered.code);
    return { ok: false, code: "template_render_failed" };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();

  if (!deliveryContext.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      "authors_smtp_not_configured",
      input.supabase,
    );
    console.error("author_application_admin_alert_authors_smtp_not_configured");
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const { smtpConfig, transport } = deliveryContext.delivery;
  const result = await createSmtpEmailProvider(smtpConfig).send({
    from: transport.from,
    envelopeFrom: transport.envelopeFrom,
    replyTo: transport.replyTo,
    to: AUTHOR_APPLICATION_ADMIN_EMAIL,
    subject:
      rendered.subject || buildAuthorApplicationAdminAlertSubject(input.displayName),
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
      "author_application_admin_alert_send_failed",
      result.code,
      result.message,
    );
    return { ok: false, code: "send_failed" };
  }

  await markOperationalEmailDeliverySent(delivery.id, input.supabase);

  return { ok: true, providerMessageId: result.providerMessageId };
}
