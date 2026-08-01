import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import type { AuthorProductModerationOutboxAction } from "@/lib/email/author-product-moderation-context";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_SUBJECT,
  renderAuthorProductModerationApprovedEmailHtml,
  renderAuthorProductModerationApprovedEmailText,
} from "@/lib/email/templates/author-product-moderation-approved";
import {
  AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_SUBJECT,
  renderAuthorProductModerationChangesRequestedEmailHtml,
  renderAuthorProductModerationChangesRequestedEmailText,
} from "@/lib/email/templates/author-product-moderation-changes-requested";
import { getAppOrigin } from "@/lib/seo/app-origin";

export type NotifyAuthorProductModerationInput = {
  /** practice_moderation_email_outbox.event_id — used only for Message-ID dedup. */
  eventId: string;
  action: AuthorProductModerationOutboxAction;
  toEmail: string;
  authorName?: string | null;
  productTitle: string;
  authorDashboardPath: string;
  publicProductPath?: string | null;
  /** Required when action === "changes_requested". */
  moderatorComment?: string | null;
  siteOrigin?: string;
};

export type NotifyAuthorProductModerationResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      code:
        | "authors_smtp_not_configured"
        | "template_render_failed"
        | "send_failed"
        | "invalid_input";
    };

export function buildAuthorProductModerationMessageId(eventId: string): string {
  return `<moderation-${eventId}@audiolad.ru>`;
}

export async function notifyAuthorProductModeration(
  input: NotifyAuthorProductModerationInput,
): Promise<NotifyAuthorProductModerationResult> {
  const eventId = input.eventId.trim();
  const toEmail = input.toEmail.trim().toLowerCase();

  if (!eventId || !toEmail || !input.productTitle?.trim() || !input.authorDashboardPath?.trim()) {
    console.error("author_product_moderation_email_invalid_input");
    return { ok: false, code: "invalid_input" };
  }

  if (input.action === "changes_requested" && !input.moderatorComment?.trim()) {
    console.error("author_product_moderation_email_invalid_input");
    return { ok: false, code: "invalid_input" };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();
  if (!deliveryContext.ok) {
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const siteOrigin = input.siteOrigin ?? getAppOrigin();
  let subject: string;
  let html: string;
  let text: string;

  try {
    if (input.action === "changes_requested") {
      subject = AUTHOR_PRODUCT_MODERATION_CHANGES_REQUESTED_EMAIL_SUBJECT;
      html = renderAuthorProductModerationChangesRequestedEmailHtml({
        authorName: input.authorName,
        productTitle: input.productTitle,
        moderatorComment: input.moderatorComment ?? "",
        authorDashboardPath: input.authorDashboardPath,
        siteOrigin,
      });
      text = renderAuthorProductModerationChangesRequestedEmailText({
        authorName: input.authorName,
        productTitle: input.productTitle,
        moderatorComment: input.moderatorComment ?? "",
        authorDashboardPath: input.authorDashboardPath,
        siteOrigin,
      });
    } else {
      subject = AUTHOR_PRODUCT_MODERATION_APPROVED_EMAIL_SUBJECT;
      html = renderAuthorProductModerationApprovedEmailHtml({
        authorName: input.authorName,
        productTitle: input.productTitle,
        authorDashboardPath: input.authorDashboardPath,
        publicProductPath: input.publicProductPath,
        siteOrigin,
      });
      text = renderAuthorProductModerationApprovedEmailText({
        authorName: input.authorName,
        productTitle: input.productTitle,
        authorDashboardPath: input.authorDashboardPath,
        publicProductPath: input.publicProductPath,
        siteOrigin,
      });
    }
  } catch (error) {
    console.error(
      "author_product_moderation_email_template_error",
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
    subject,
    html,
    text,
    headers: {
      // Stable across retries so a rare crash-window duplicate can be
      // collapsed by a downstream Message-ID-aware mail client/server.
      "Message-ID": buildAuthorProductModerationMessageId(eventId),
    },
  });

  if (!result.ok) {
    return { ok: false, code: "send_failed" };
  }

  return { ok: true, providerMessageId: result.providerMessageId };
}
