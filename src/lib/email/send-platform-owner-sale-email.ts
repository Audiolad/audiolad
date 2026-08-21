import type { SupabaseClient } from "@supabase/supabase-js";

import { PLATFORM_OWNER_SALE_EMAIL } from "@/lib/admin/sales";
import { resolveAuthorsEmailDeliveryFromEnv } from "@/lib/email/authors-email-transport";
import {
  acquireOperationalEmailDelivery,
  markOperationalEmailDeliveryAttempt,
  markOperationalEmailDeliveryFailed,
  markOperationalEmailDeliverySent,
  PLATFORM_OWNER_SALE_MESSAGE_TYPE,
} from "@/lib/email/operational-deliveries";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import {
  PLATFORM_OWNER_SALE_EMAIL_TEMPLATE_KEY,
  PLATFORM_OWNER_SALE_EMAIL_TEMPLATE_VERSION,
  buildPlatformOwnerSaleEmailSubject,
  type PlatformOwnerSaleEmailInput,
} from "@/lib/email/templates/platform-owner-sale";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";

export type SendPlatformOwnerSaleEmailInput = PlatformOwnerSaleEmailInput & {
  toEmail?: string;
  supabase?: SupabaseClient;
};

export type SendPlatformOwnerSaleEmailResult =
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

export function buildPlatformOwnerSaleMessageId(paymentId: string): string {
  return `<platform-owner-sale-${paymentId}@audiolad.ru>`;
}

export async function sendPlatformOwnerSaleEmail(
  input: SendPlatformOwnerSaleEmailInput,
): Promise<SendPlatformOwnerSaleEmailResult> {
  const paymentId = input.paymentId.trim();
  const orderId = input.orderId.trim();
  const toEmail = (input.toEmail?.trim() || PLATFORM_OWNER_SALE_EMAIL).toLowerCase();

  if (
    !paymentId ||
    !orderId ||
    !toEmail ||
    !input.productTitle?.trim() ||
    !input.paidAt ||
    !Number.isFinite(input.amountMinor)
  ) {
    console.error("platform_owner_sale_email_invalid_input");
    return { ok: false, code: "invalid_input" };
  }

  const acquired = await acquireOperationalEmailDelivery(
    {
      applicationId: paymentId,
      recipientEmail: toEmail,
      messageType: PLATFORM_OWNER_SALE_MESSAGE_TYPE,
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
    templateKey: PLATFORM_OWNER_SALE_EMAIL_TEMPLATE_KEY,
    templateVersion: PLATFORM_OWNER_SALE_EMAIL_TEMPLATE_VERSION,
    payload: {
      productTitle: input.productTitle,
      authorName: input.authorName,
      amountMinor: input.amountMinor,
      currency: input.currency,
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      paidAt: input.paidAt,
      orderId,
      paymentId,
      paymentStatus: input.paymentStatus,
      checkoutOriginPath: input.checkoutOriginPath,
      siteOrigin: input.siteOrigin,
    },
  });

  if (!rendered.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `template_render_failed:${rendered.code}`,
      input.supabase,
    );
    console.error("platform_owner_sale_email_render_failed", rendered.code);
    return { ok: false, code: "template_render_failed" };
  }

  const deliveryContext = resolveAuthorsEmailDeliveryFromEnv();
  if (!deliveryContext.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      "authors_smtp_not_configured",
      input.supabase,
    );
    console.error("platform_owner_sale_email_authors_smtp_not_configured");
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const { smtpConfig, transport } = deliveryContext.delivery;
  const result = await createSmtpEmailProvider(smtpConfig).send({
    from: transport.from,
    envelopeFrom: transport.envelopeFrom,
    replyTo: transport.replyTo,
    to: toEmail,
    subject:
      rendered.subject ||
      buildPlatformOwnerSaleEmailSubject(
        input.amountMinor,
        input.productTitle,
        input.currency,
      ),
    html: rendered.html,
    text: rendered.text,
    headers: {
      "Message-ID": buildPlatformOwnerSaleMessageId(paymentId),
    },
  });

  if (!result.ok) {
    await markOperationalEmailDeliveryFailed(
      delivery.id,
      `${result.code}:${result.message ?? "send_failed"}`,
      input.supabase,
    );
    console.error("platform_owner_sale_email_send_failed", result.code);
    return { ok: false, code: "send_failed" };
  }

  await markOperationalEmailDeliverySent(delivery.id, input.supabase);

  return { ok: true, providerMessageId: result.providerMessageId };
}
