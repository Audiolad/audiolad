import { getAppOrigin } from "../../seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const AUTHOR_PRODUCT_SOLD_EMAIL_SUBJECT =
  "Ваш продукт купили на АудиоЛаде";
export const AUTHOR_PRODUCT_SOLD_EMAIL_TEMPLATE_KEY = "author_product_sold";
export const AUTHOR_PRODUCT_SOLD_EMAIL_TEMPLATE_VERSION =
  "author-product-sold-v1-20260730";

export type AuthorProductSoldEmailInput = {
  authorName?: string | null;
  productTitle: string;
  buyerFirstName?: string | null;
  buyerLastName?: string | null;
  paidAt: string;
  amountMinor: number;
  authorAmountMinor?: number | null;
  authorAmountPending?: boolean;
  siteOrigin?: string;
};

function formatRub(amountMinor: number): string {
  return `${(amountMinor / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

function formatPaidAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

function buyerLabel(input: AuthorProductSoldEmailInput): string {
  const parts = [
    input.buyerFirstName?.trim(),
    input.buyerLastName?.trim(),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : "Покупатель";
}

export function getAuthorFinanceUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/author-dashboard/finance`;
}

export function renderAuthorProductSoldEmailHtml(
  input: AuthorProductSoldEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const financeUrl = getAuthorFinanceUrl(siteOrigin);
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
  const amountLine =
    input.authorAmountPending ||
    input.authorAmountMinor === null ||
    input.authorAmountMinor === undefined
      ? "Сумма начисления появится в разделе «Финансы» после завершения расчёта."
      : `Начисление вам: ${formatRub(input.authorAmountMinor)}.`;

  const bodyHtml = [
    renderBrandEmailHeading(AUTHOR_PRODUCT_SOLD_EMAIL_SUBJECT),
    renderBrandEmailParagraph(greeting, "email-greeting"),
    renderBrandEmailParagraph(
      `Ваш продукт «${input.productTitle}» купили на АудиоЛаде.`,
      "email-body",
      "0 0 16px",
    ),
    renderBrandEmailParagraph(
      [
        `Покупатель: ${buyerLabel(input)}`,
        `Дата и время: ${formatPaidAt(input.paidAt)}`,
        `Стоимость: ${formatRub(input.amountMinor)}`,
        amountLine,
      ].join("<br />"),
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(financeUrl, "Открыть раздел «Финансы»"),
    renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
    renderBrandEmailParagraph(
      "<strong>Команда АудиоЛад</strong>",
      "email-body",
      "0",
    ),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: AUTHOR_PRODUCT_SOLD_EMAIL_SUBJECT,
    preheader: `Покупка: ${input.productTitle}`,
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "В письме нет контактных данных покупателя.",
    ],
  });
}

export function renderAuthorProductSoldEmailText(
  input: AuthorProductSoldEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const financeUrl = getAuthorFinanceUrl(siteOrigin);
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
  const amountLine =
    input.authorAmountPending ||
    input.authorAmountMinor === null ||
    input.authorAmountMinor === undefined
      ? "Сумма начисления появится в разделе «Финансы» после завершения расчёта."
      : `Начисление вам: ${formatRub(input.authorAmountMinor)}.`;

  return [
    AUTHOR_PRODUCT_SOLD_EMAIL_SUBJECT,
    "",
    greeting,
    "",
    `Ваш продукт «${input.productTitle}» купили на АудиоЛаде.`,
    `Покупатель: ${buyerLabel(input)}`,
    `Дата и время: ${formatPaidAt(input.paidAt)}`,
    `Стоимость: ${formatRub(input.amountMinor)}`,
    amountLine,
    "",
    `Открыть раздел «Финансы»: ${financeUrl}`,
    "",
    "С уважением,",
    "Команда АудиоЛад",
  ].join("\n");
}
