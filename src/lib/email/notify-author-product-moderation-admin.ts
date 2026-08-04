import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import type { AuthorProductModerationAdminOutboxAction } from "@/lib/email/author-product-moderation-context";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  buildAuthorProductModerationAdminAlertSubject,
  renderAuthorProductModerationAdminAlertEmailHtml,
  renderAuthorProductModerationAdminAlertEmailText,
  type AuthorProductModerationAdminAlertKind,
} from "@/lib/email/templates/author-product-moderation-admin-alert";
import { getAppOrigin } from "@/lib/seo/app-origin";

export const AUTHOR_PRODUCT_MODERATION_ADMIN_EMAIL = "authors@audiolad.ru";

export type NotifyAuthorProductModerationAdminInput = {
  eventId: string;
  action: AuthorProductModerationAdminOutboxAction;
  toEmail: string;
  productId: string;
  productTitle: string;
  authorName: string;
  authorProjectName: string;
  productKindLabel: string;
  priceLabel: string;
  audioTrackCount: number;
  submissionKindLabel: string;
  submittedAt: string | null;
  adminReviewPath: string;
  siteOrigin?: string;
};

export type NotifyAuthorProductModerationAdminResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      code:
        | "authors_smtp_not_configured"
        | "template_render_failed"
        | "send_failed"
        | "invalid_input";
    };

export function buildAuthorProductModerationAdminMessageId(eventId: string): string {
  return `<moderation-admin-${eventId}@audiolad.ru>`;
}

function formatSubmittedAtLabel(submittedAt: string | null): string {
  if (!submittedAt) {
    return "—";
  }

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

export async function notifyAuthorProductModerationAdmin(
  input: NotifyAuthorProductModerationAdminInput,
): Promise<NotifyAuthorProductModerationAdminResult> {
  const eventId = input.eventId.trim();
  const toEmail = input.toEmail.trim().toLowerCase();
  const productId = input.productId.trim();
  const adminReviewPath = input.adminReviewPath.trim();

  if (
    !eventId ||
    !toEmail ||
    !productId ||
    !input.productTitle?.trim() ||
    !adminReviewPath.startsWith("/admin/product-moderation/")
  ) {
    console.error("author_product_moderation_admin_email_invalid_input");
    return { ok: false, code: "invalid_input" };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();
  if (!deliveryContext.ok) {
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const siteOrigin = input.siteOrigin ?? getAppOrigin();
  const kind: AuthorProductModerationAdminAlertKind =
    input.action === "resubmitted" ? "resubmitted" : "submitted";

  let subject: string;
  let html: string;
  let text: string;

  try {
    const payload = {
      productId,
      productTitle: input.productTitle,
      authorName: input.authorName,
      authorProjectName: input.authorProjectName,
      productKindLabel: input.productKindLabel,
      priceLabel: input.priceLabel,
      audioTrackCount: input.audioTrackCount,
      submissionKindLabel: input.submissionKindLabel,
      submittedAtLabel: formatSubmittedAtLabel(input.submittedAt),
      kind,
      siteOrigin,
    };
    subject = buildAuthorProductModerationAdminAlertSubject(
      input.productTitle,
      kind,
    );
    html = renderAuthorProductModerationAdminAlertEmailHtml(payload);
    text = renderAuthorProductModerationAdminAlertEmailText(payload);
  } catch (error) {
    console.error(
      "author_product_moderation_admin_email_template_error",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, code: "template_render_failed" };
  }

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
      "Message-ID": buildAuthorProductModerationAdminMessageId(eventId),
    },
  });

  if (!result.ok) {
    return { ok: false, code: "send_failed" };
  }

  return { ok: true, providerMessageId: result.providerMessageId };
}
