import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  AUTHOR_PRODUCT_SOLD_EMAIL_SUBJECT,
  renderAuthorProductSoldEmailHtml,
  renderAuthorProductSoldEmailText,
  type AuthorProductSoldEmailInput,
} from "@/lib/email/templates/author-product-sold";
import { getAppOrigin } from "@/lib/seo/app-origin";

export type SendAuthorProductSoldEmailInput = AuthorProductSoldEmailInput & {
  toEmail: string;
  /** Stable sale/order id used only for dedup — never rendered in the email. */
  saleId: string;
};

export type SendAuthorProductSoldEmailResult =
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

export function buildAuthorSaleMessageId(saleId: string): string {
  return `<author-sale-${saleId}@audiolad.ru>`;
}

export async function sendAuthorProductSoldEmail(
  input: SendAuthorProductSoldEmailInput,
): Promise<SendAuthorProductSoldEmailResult> {
  const saleId = input.saleId.trim();
  const toEmail = input.toEmail.trim().toLowerCase();

  if (!saleId || !toEmail || !input.productTitle?.trim() || !input.paidAt) {
    console.error("author_product_sold_email_invalid_input");
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
    html = renderAuthorProductSoldEmailHtml({ ...input, siteOrigin });
    text = renderAuthorProductSoldEmailText({ ...input, siteOrigin });
  } catch (error) {
    console.error(
      "author_product_sold_email_template_error",
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
    subject: AUTHOR_PRODUCT_SOLD_EMAIL_SUBJECT,
    html,
    text,
    headers: {
      // Stable across retries. SMTP does not promise deduplication, but
      // downstream systems that dedupe RFC 5322 Message-ID can collapse the
      // rare crash-window duplicate.
      "Message-ID": buildAuthorSaleMessageId(saleId),
    },
  });

  if (!result.ok) {
    return { ok: false, code: "send_failed" };
  }

  return { ok: true, providerMessageId: result.providerMessageId };
}
