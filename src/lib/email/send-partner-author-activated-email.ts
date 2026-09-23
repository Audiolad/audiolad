import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  PARTNER_AUTHOR_ACTIVATED_EMAIL_SUBJECT,
  renderPartnerAuthorActivatedEmailHtml,
  renderPartnerAuthorActivatedEmailText,
  type PartnerAuthorActivatedEmailInput,
} from "@/lib/email/templates/partner-author-activated";
import { getSenderIdentity } from "@/lib/email/sender-identities";
import { getAppOrigin } from "@/lib/seo/app-origin";

export type SendPartnerAuthorActivatedEmailInput =
  PartnerAuthorActivatedEmailInput & {
    toEmail: string;
    /** Referral id. Used only for a stable Message-ID. Never rendered. */
    referralId: string;
  };

export type SendPartnerAuthorActivatedEmailResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      code:
        | "authors_smtp_not_configured"
        | "template_render_failed"
        | "send_failed"
        | "invalid_input";
    };

/** Canonical authors mailbox. There is no separate author@ sender. */
export function partnerActivationEmailFromAddress(): string {
  return getSenderIdentity("authors").from;
}

export function buildPartnerAuthorActivatedMessageId(referralId: string): string {
  return `<partner-author-activated-${referralId.trim()}@audiolad.ru>`;
}

export async function sendPartnerAuthorActivatedEmail(
  input: SendPartnerAuthorActivatedEmailInput,
): Promise<SendPartnerAuthorActivatedEmailResult> {
  const referralId = input.referralId.trim();
  const toEmail = input.toEmail.trim().toLowerCase();
  const activatedAt = input.activatedAt?.trim() ?? "";
  const expiresAt = input.expiresAt?.trim() ?? "";

  if (!referralId || !toEmail || !toEmail.includes("@") || !activatedAt || !expiresAt) {
    console.error("partner_author_activated_email_invalid_input");
    return { ok: false, code: "invalid_input" };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();
  if (!deliveryContext.ok) {
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const siteOrigin = input.siteOrigin ?? getAppOrigin();
  let html: string;
  let text: string;
  try {
    html = renderPartnerAuthorActivatedEmailHtml({ ...input, siteOrigin });
    text = renderPartnerAuthorActivatedEmailText({ ...input, siteOrigin });
  } catch (error) {
    console.error(
      "partner_author_activated_email_template_error",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, code: "template_render_failed" };
  }

  const { smtpConfig, transport } = deliveryContext.delivery;
  const provider = createSmtpEmailProvider(smtpConfig);
  const result = await provider.send({
    from: transport.from,
    envelopeFrom: transport.envelopeFrom,
    replyTo: transport.replyTo,
    to: toEmail,
    subject: PARTNER_AUTHOR_ACTIVATED_EMAIL_SUBJECT,
    html,
    text,
    headers: {
      "Message-ID": buildPartnerAuthorActivatedMessageId(referralId),
    },
  });

  if (!result.ok) {
    console.error(
      "partner_author_activated_email_send_failed",
      result.code,
      result.message,
    );
    return { ok: false, code: "send_failed" };
  }

  return { ok: true, providerMessageId: result.providerMessageId };
}
