import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_SUBJECT =
  "Нужно уточнить данные для выплат";
export const PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY =
  "payout_profile_needs_changes";
export const PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_TEMPLATE_VERSION =
  "payout-profile-needs-changes-v1-20260728";

export type PayoutProfileNeedsChangesEmailInput = {
  authorName?: string | null;
  siteOrigin?: string;
};

export function getPayoutDetailsUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/author-dashboard/commercial/payout-details`;
}

export function renderPayoutProfileNeedsChangesEmailHtml(
  input: PayoutProfileNeedsChangesEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const payoutUrl = getPayoutDetailsUrl(siteOrigin);
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";

  const bodyHtml = [
    renderBrandEmailHeading("Нужно уточнить данные для выплат"),
    renderBrandEmailParagraph(greeting, "email-greeting"),
    renderBrandEmailParagraph(
      "Мы проверили ваши данные для выплат и просим внести исправления. Комментарий команды доступен в кабинете автора.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton("Открыть форму", payoutUrl),
    renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
    renderBrandEmailParagraph(
      "<strong>Команда АудиоЛад</strong>",
      "email-body",
      "0",
    ),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_SUBJECT,
    preheader: PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_SUBJECT,
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что ваши данные для выплат на АудиоЛаде требуют уточнения.",
    ],
  });
}

export function renderPayoutProfileNeedsChangesEmailText(
  input: PayoutProfileNeedsChangesEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const payoutUrl = getPayoutDetailsUrl(siteOrigin);
  const name = input.authorName?.trim() || "";
  const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";

  return [
    PAYOUT_PROFILE_NEEDS_CHANGES_EMAIL_SUBJECT,
    "",
    greeting,
    "",
    "Мы проверили ваши данные для выплат и просим внести исправления. Комментарий команды доступен в кабинете автора.",
    "",
    `Открыть форму: ${payoutUrl}`,
    "",
    "С уважением,",
    "Команда АудиоЛад",
  ].join("\n");
}
