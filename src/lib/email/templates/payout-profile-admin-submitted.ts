import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailCtaWithFallback,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_KEY =
  "payout_profile_admin_submitted";
export const PAYOUT_PROFILE_ADMIN_SUBMITTED_EMAIL_TEMPLATE_VERSION =
  "payout-profile-admin-submitted-v2-20260804";

export type PayoutProfileAdminSubmittedEmailInput = {
  authorName: string;
  profileId: string;
  siteOrigin?: string;
};

export function buildPayoutProfileAdminSubmittedSubject(
  authorName: string,
): string {
  const name = authorName.trim() || "Автор";
  return `Новые данные автора для выплат – ${name}`;
}

export function renderPayoutProfileAdminSubmittedEmailHtml(
  input: PayoutProfileAdminSubmittedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const authorName = input.authorName.trim() || "Автор";
  const detailUrl = `${siteOrigin}/admin/payout-profiles/${input.profileId}`;
  const heading = "Новые данные автора для выплат";

  const bodyHtml = [
    renderBrandEmailHeading(heading),
    renderBrandEmailParagraph(
      `Автор <strong>${escapeHtml(authorName)}</strong> отправил данные для выплат на проверку.`,
      "email-body",
      "0 0 16px",
    ),
    renderBrandEmailParagraph(
      "Откройте административную панель, чтобы проверить анкету.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailCtaWithFallback(detailUrl, "Открыть анкету"),
  ].join("");

  return renderBrandEmailShell({
    title: heading,
    preheader: buildPayoutProfileAdminSubmittedSubject(authorName),
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Служебное уведомление административной панели АудиоЛад.",
    ],
  });
}

export function renderPayoutProfileAdminSubmittedEmailText(
  input: PayoutProfileAdminSubmittedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const authorName = input.authorName.trim() || "Автор";
  const detailUrl = `${siteOrigin}/admin/payout-profiles/${input.profileId}`;

  return [
    buildPayoutProfileAdminSubmittedSubject(authorName),
    "",
    `Автор ${authorName} отправил данные для выплат на проверку.`,
    "Откройте административную панель, чтобы проверить анкету.",
    "",
    `Открыть анкету: ${detailUrl}`,
    `Если кнопка не работает, откройте ссылку: ${detailUrl}`,
  ].join("\n");
}
