import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import {
  formatPartnerCabinetDate,
  partnerRewardUntilCopy,
} from "@/lib/author-partner/invitees";

export const PARTNER_AUTHOR_ACTIVATED_EMAIL_SUBJECT =
  "По вашей партнёрской ссылке появился новый автор";

export const PARTNER_AUTHOR_ACTIVATED_EMAIL_TEMPLATE_KEY =
  "partner_author_activated";

export type PartnerAuthorActivatedEmailInput = {
  partnerName: string;
  inviteeAuthorName: string;
  activatedAt: string;
  expiresAt: string;
  siteOrigin?: string;
};

export function getPartnerYour20Url(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/author-dashboard/your-20`;
}

function greetingName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("@")) return "партнёр";
  return trimmed;
}

function authorName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("@")) return "Автор";
  return trimmed;
}

export function renderPartnerAuthorActivatedEmailHtml(
  input: PartnerAuthorActivatedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const cabinetUrl = getPartnerYour20Url(siteOrigin);
  const partner = greetingName(input.partnerName);
  const invitee = authorName(input.inviteeAuthorName);
  const activated = formatPartnerCabinetDate(input.activatedAt);

  const bodyHtml = [
    renderBrandEmailHeading(PARTNER_AUTHOR_ACTIVATED_EMAIL_SUBJECT),
    renderBrandEmailParagraph(`Здравствуйте, ${partner}!`, "email-greeting"),
    renderBrandEmailParagraph(
      `По вашей партнёрской ссылке зарегистрирован новый автор: ${invitee}.`,
      "email-body",
    ),
    renderBrandEmailParagraph(`Дата: ${activated}`, "email-body"),
    renderBrandEmailParagraph(
      partnerRewardUntilCopy(input.expiresAt),
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Партнёрское вознаграждение выплачивает АудиоЛад из своей доли и не уменьшает роялти приглашённого автора.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Список приглашённых авторов — в разделе «Ваши 20%».",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(cabinetUrl, "Открыть «Ваши 20%»"),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: PARTNER_AUTHOR_ACTIVATED_EMAIL_SUBJECT,
    preheader: `По вашей партнёрской ссылке зарегистрирован новый автор: ${invitee}`,
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "В письме нет адреса электронной почты приглашённого.",
    ],
  });
}

export function renderPartnerAuthorActivatedEmailText(
  input: PartnerAuthorActivatedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const cabinetUrl = getPartnerYour20Url(siteOrigin);
  const partner = greetingName(input.partnerName);
  const invitee = authorName(input.inviteeAuthorName);
  const activated = formatPartnerCabinetDate(input.activatedAt);

  return [
    PARTNER_AUTHOR_ACTIVATED_EMAIL_SUBJECT,
    "",
    `Здравствуйте, ${partner}!`,
    "",
    `По вашей партнёрской ссылке зарегистрирован новый автор: ${invitee}.`,
    `Дата: ${activated}`,
    partnerRewardUntilCopy(input.expiresAt),
    "Партнёрское вознаграждение выплачивает АудиоЛад из своей доли и не уменьшает роялти приглашённого автора.",
    "Список приглашённых авторов — в разделе «Ваши 20%».",
    cabinetUrl,
    "",
  ].join("\n");
}
