import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import {
  acquireOperationalEmailDelivery,
  markOperationalEmailDeliveryAttempt,
  markOperationalEmailDeliveryFailed,
  markOperationalEmailDeliverySent,
  PAYOUT_PROFILE_NEEDS_CHANGES_MESSAGE_TYPE,
  PAYOUT_PROFILE_REJECTED_MESSAGE_TYPE,
  PAYOUT_PROFILE_VERIFIED_MESSAGE_TYPE,
} from "@/lib/email/operational-deliveries";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_SUBJECT,
  PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY,
  PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/payout-profile-needs-changes";
import {
  PAYOUT_PROFILE_REJECTED_EMAIL_SUBJECT,
  PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_KEY,
  PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/payout-profile-rejected";
import {
  PAYOUT_PROFILE_VERIFIED_EMAIL_SUBJECT,
  PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_KEY,
  PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_VERSION,
} from "@/lib/email/templates/payout-profile-verified";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";
import { getAppOrigin } from "@/lib/seo/app-origin";

export type PayoutProfileAuthorStatusEmailKind =
  | "needs_changes"
  | "verified"
  | "rejected";

export type SendPayoutProfileAuthorStatusEmailInput = {
  toEmail: string;
  profileId: string;
  profileVersion: number;
  kind: PayoutProfileAuthorStatusEmailKind;
  authorName?: string | null;
  siteOrigin?: string;
  forceResend?: boolean;
  supabase?: SupabaseClient;
};

export type SendPayoutProfileAuthorStatusEmailResult =
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

function resolveMessageType(
  kind: PayoutProfileAuthorStatusEmailKind,
): string {
  switch (kind) {
    case "needs_changes":
      return PAYOUT_PROFILE_NEEDS_CHANGES_MESSAGE_TYPE;
    case "verified":
      return PAYOUT_PROFILE_VERIFIED_MESSAGE_TYPE;
    case "rejected":
      return PAYOUT_PROFILE_REJECTED_MESSAGE_TYPE;
  }
}

function resolveTemplate(
  kind: PayoutProfileAuthorStatusEmailKind,
): { key: string; version: string; fallbackSubject: string } {
  switch (kind) {
    case "needs_changes":
      return {
        key: PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY,
        version: PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_VERSION,
        fallbackSubject: PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_SUBJECT,
      };
    case "verified":
      return {
        key: PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_KEY,
        version: PAYOUT_PROFILE_VERIFIED_EMAIL_TEMPLATE_VERSION,
        fallbackSubject: PAYOUT_PROFILE_VERIFIED_EMAIL_SUBJECT,
      };
    case "rejected":
      return {
        key: PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_KEY,
        version: PAYOUT_PROFILE_REJECTED_EMAIL_TEMPLATE_VERSION,
        fallbackSubject: PAYOUT_PROFILE_REJECTED_EMAIL_SUBJECT,
      };
  }
}

export async function sendPayoutProfileAuthorStatusEmail(
  input: SendPayoutProfileAuthorStatusEmailInput,
): Promise<SendPayoutProfileAuthorStatusEmailResult> {
  const profileId = input.profileId.trim();
  const toEmail = input.toEmail.trim().toLowerCase();
  const messageType = resolveMessageType(input.kind);

  if (!profileId || !toEmail || !input.profileVersion) {
    console.error("payout_profile_author_status_email_invalid_input");
    return { ok: false, code: "invalid_input" };
  }

  const acquired = await acquireOperationalEmailDelivery(
    {
      applicationId: profileId,
      recipientEmail: toEmail,
      messageType,
      profileVersion: input.profileVersion,
      forceResend: input.forceResend === true,
    },
    input.supabase,
  );

  if (!acquired.ok) {
    console.error(
      "payout_profile_author_status_email_delivery_persist_failed",
      acquired.code,
    );
    return { ok: false, code: acquired.code };
  }

  if (!acquired.shouldSend) {
    return { ok: true, skipped: true };
  }

  const delivery = acquired.delivery;
  await markOperationalEmailDeliveryAttempt(delivery.id, input.supabase);

  const template = resolveTemplate(input.kind);
  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: template.key,
    templateVersion: template.version,
    payload: {
      authorName: input.authorName ?? "",
      siteOrigin: input.siteOrigin ?? getAppOrigin(),
    },
  });

  if (!rendered.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `template_render_failed:${rendered.code}`,
      input.supabase,
    );
    console.error(
      "payout_profile_author_status_email_render_failed",
      rendered.code,
    );
    return { ok: false, code: "template_render_failed" };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();

  if (!deliveryContext.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      "authors_smtp_not_configured",
      input.supabase,
    );
    console.error("payout_profile_author_status_email_authors_smtp_not_configured");
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const { smtpConfig, transport } = deliveryContext.delivery;
  const provider = createSmtpEmailProvider(smtpConfig);

  const result = await provider.send({
    from: transport.from,
    envelopeFrom: transport.envelopeFrom,
    replyTo: transport.replyTo,
    to: toEmail,
    subject: rendered.subject || template.fallbackSubject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!result.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `${result.code}:${result.message ?? "send_failed"}`,
      input.supabase,
    );
    console.error("payout_profile_author_status_email_send_failed", result.code);
    return { ok: false, code: "send_failed" };
  }

  await markOperationalEmailDeliverySent(delivery.id, input.supabase);

  return {
    ok: true,
    providerMessageId: result.providerMessageId,
  };
}
