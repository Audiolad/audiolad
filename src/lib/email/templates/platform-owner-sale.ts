import {
  buildPlatformOwnerSaleSubject,
  formatAdminSaleAmount,
} from "@/lib/admin/sales";
import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailCtaWithFallback,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const PLATFORM_OWNER_SALE_EMAIL_TEMPLATE_KEY = "platform_owner_sale";
export const PLATFORM_OWNER_SALE_EMAIL_TEMPLATE_VERSION =
  "platform-owner-sale-v1-20260821";

export type PlatformOwnerSaleEmailInput = {
  productTitle: string;
  authorName: string | null;
  amountMinor: number;
  currency?: string;
  buyerName: string;
  buyerEmail: string | null;
  paidAt: string;
  orderId: string;
  paymentId: string;
  paymentStatus: string;
  checkoutOriginPath?: string | null;
  siteOrigin?: string;
};

export function buildPlatformOwnerSaleEmailSubject(
  amountMinor: number,
  productTitle: string,
  currency = "RUB",
): string {
  return buildPlatformOwnerSaleSubject({
    amountMinor,
    productTitle,
    currency,
  });
}

export function getAdminSaleDetailUrl(
  paymentId: string,
  siteOrigin?: string,
): string {
  const origin = (siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  return `${origin}/admin/sales/${paymentId}`;
}

function formatPaidAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(parsed);
}

function saleLines(input: PlatformOwnerSaleEmailInput): string[] {
  const lines = [
    `Продукт: ${input.productTitle.trim() || "Продукт"}`,
    `Автор: ${input.authorName?.trim() || "—"}`,
    `Сумма: ${formatAdminSaleAmount(input.amountMinor, input.currency ?? "RUB")}`,
    `Покупатель: ${input.buyerName.trim() || "Покупатель"}`,
    `Email покупателя: ${input.buyerEmail?.trim() || "—"}`,
    `Дата и время: ${formatPaidAt(input.paidAt)}`,
    `ID заказа: ${input.orderId}`,
    `ID платежа: ${input.paymentId}`,
    `Статус оплаты: ${input.paymentStatus}`,
  ];

  const source = input.checkoutOriginPath?.trim();
  if (source) {
    lines.push(`Source / purchase URL: ${source}`);
  }

  return lines;
}

export function renderPlatformOwnerSaleEmailHtml(
  input: PlatformOwnerSaleEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const detailUrl = getAdminSaleDetailUrl(input.paymentId, siteOrigin);
  const subject = buildPlatformOwnerSaleEmailSubject(
    input.amountMinor,
    input.productTitle,
    input.currency,
  );
  const bodyHtml = [
    renderBrandEmailHeading("Новая продажа"),
    renderBrandEmailParagraph(
      saleLines(input)
        .map((line) => escapeHtml(line))
        .join("<br />"),
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailCtaWithFallback(detailUrl, "Открыть продажу"),
  ].join("");

  return renderBrandEmailShell({
    title: subject,
    preheader: subject,
    logoUrl: `${siteOrigin}/brand/audiolad-logo-horizontal.png`,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Служебное уведомление владельца платформы.",
    ],
  });
}

export function renderPlatformOwnerSaleEmailText(
  input: PlatformOwnerSaleEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const detailUrl = getAdminSaleDetailUrl(input.paymentId, siteOrigin);
  const subject = buildPlatformOwnerSaleEmailSubject(
    input.amountMinor,
    input.productTitle,
    input.currency,
  );

  return [subject, "", ...saleLines(input), "", `Открыть продажу: ${detailUrl}`].join(
    "\n",
  );
}
