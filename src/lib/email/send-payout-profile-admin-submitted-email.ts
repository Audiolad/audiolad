import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import { getSenderIdentity } from "@/lib/email/sender-identities";
import {
  PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_KEY,
  PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_VERSION,
  buildPayoutProfileAdminSubmittedSubject,
} from "@/lib/email/templates/payout-profile-admin-submitted";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";
import { getAppOrigin } from "@/lib/seo/app-origin";

export type SendPayoutProfileAdminSubmittedEmailInput = {
  authorName: string;
  profileId: string;
  siteOrigin?: string;
  toEmail?: string;
};

export type SendPayoutProfileAdminSubmittedEmailResult =
  | { ok: true; providerMessageId?: string; toEmail: string }
  | {
      ok: false;
      code:
        | "authors_smtp_not_configured"
        | "template_render_failed"
        | "send_failed"
        | "recipient_missing";
    };

export function resolvePayoutProfileAdminAlertEmail(): string | null {
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

export async function sendPayoutProfileAdminSubmittedEmail(
  input: SendPayoutProfileAdminSubmittedEmailInput,
): Promise<SendPayoutProfileAdminSubmittedEmailResult> {
  const toEmail = (
    input.toEmail?.trim() ||
    resolvePayoutProfileAdminAlertEmail() ||
    ""
  ).toLowerCase();

  if (!toEmail) {
    console.error("payout_profile_admin_submitted_recipient_missing");
    return { ok: false, code: "recipient_missing" };
  }

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_KEY,
    templateVersion: PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_VERSION,
    payload: {
      authorName: input.authorName,
      profileId: input.profileId,
      siteOrigin: input.siteOrigin ?? getAppOrigin(),
    },
  });

  if (!rendered.ok) {
    console.error(
      "payout_profile_admin_submitted_email_render_failed",
      rendered.code,
    );
    return { ok: false, code: "template_render_failed" };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();

  if (!deliveryContext.ok) {
    console.error("payout_profile_admin_submitted_authors_smtp_not_configured");
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const { smtpConfig, transport } = deliveryContext.delivery;
  const provider = createSmtpEmailProvider(smtpConfig);
  const subject =
    rendered.subject ||
    buildPayoutProfileAdminSubmittedSubject(input.authorName);

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
      "payout_profile_admin_submitted_email_send_failed",
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
