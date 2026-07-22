import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const AUTHOR_ACCESS_GRANTED_EMAIL_SUBJECT =
  "Вам открыт кабинет автора АудиоЛада";
export const AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_KEY = "author_access_granted";
export const AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_VERSION =
  "author-access-granted-v1-20260722";

export type AuthorAccessGrantedEmailInput = {
  userName: string;
  siteOrigin?: string;
};

export function getAuthorDashboardUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/author-dashboard`;
}

export function renderAuthorAccessGrantedEmailHtml(
  input: AuthorAccessGrantedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const userName = input.userName.trim() || "автор";
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const dashboardUrl = getAuthorDashboardUrl(siteOrigin);

  const bodyHtml = [
    renderBrandEmailHeading("Вам открыт кабинет автора АудиоЛада"),
    renderBrandEmailParagraph(
      `Здравствуйте, <strong>${escapeHtml(userName)}</strong>!`,
      "email-greeting",
    ),
    renderBrandEmailParagraph(
      "Ваша заявка на авторство одобрена. Для вас открыт <strong>бесплатный авторский аккаунт</strong>.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Теперь вы можете оформить страницу автора, загружать и публиковать бесплатные аудиопродукты.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Продажи и платные продукты станут доступны после отдельного коммерческого подключения.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(dashboardUrl, "Перейти в кабинет автора", {
      msoWidth: 320,
    }),
    renderBrandEmailParagraph(
      "Если у вас появятся вопросы — просто ответьте на это письмо.",
      "email-body",
      "24px 0 0",
    ),
    renderBrandEmailParagraph("<strong>Команда АудиоЛад</strong>", "email-body", "0"),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: "Кабинет автора АудиоЛада",
    preheader: AUTHOR_ACCESS_GRANTED_EMAIL_SUBJECT,
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что ваша заявка на авторство была одобрена.",
    ],
  });
}

export function renderAuthorAccessGrantedEmailText(
  input: AuthorAccessGrantedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const userName = input.userName.trim() || "автор";
  const dashboardUrl = getAuthorDashboardUrl(siteOrigin);

  return [
    "Вам открыт кабинет автора АудиоЛада",
    "",
    `Здравствуйте, ${userName}!`,
    "",
    "Ваша заявка на авторство одобрена. Для вас открыт бесплатный авторский аккаунт.",
    "Теперь вы можете оформить страницу автора, загружать и публиковать бесплатные аудиопродукты.",
    "Продажи и платные продукты станут доступны после отдельного коммерческого подключения.",
    "",
    `Перейти в кабинет автора: ${dashboardUrl}`,
    "",
    "Команда АудиоЛад",
  ].join("\n");
}
