import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailDivider,
  renderBrandEmailInfoBlock,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const WELCOME_EMAIL_SUBJECT = "Ваш доступ к АудиоЛаду";
export const WELCOME_EMAIL_PREHEADER =
  "Все ваши практики будут храниться в личной Аудиотеке.";
export const WELCOME_EMAIL_TEMPLATE_KEY = "welcome";
export const WELCOME_EMAIL_TEMPLATE_VERSION = "library-access-v1-20260722";

export type WelcomeEmailInput = {
  userName: string;
  siteOrigin?: string;
};

export function getWelcomeEmailLibraryUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/my-practices`;
}

function renderWelcomeLibraryFooterBlock(libraryUrl: string): string {
  return renderBrandEmailInfoBlock(
    [
      renderBrandEmailParagraph(
        "<strong>Все ваши практики хранятся в АудиоЛаде</strong>",
        "email-body",
        "0 0 10px",
      ),
      renderBrandEmailParagraph(
        "Открывайте свою Аудиотеку в любое время на <strong>audiolad.ru</strong>",
        "email-body",
        "0 0 10px",
      ),
      renderBrandEmailParagraph(
        `<a href="${escapeHtml(libraryUrl)}" style="color: #5e2ca5; text-decoration: none; font-weight: 600">${escapeHtml(libraryUrl)}</a>`,
        "email-body",
        "0",
      ),
    ].join("\n                      "),
  );
}

export function renderWelcomeEmailHtml(input: WelcomeEmailInput): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const userName = input.userName.trim() || "друг";
  const libraryUrl = getWelcomeEmailLibraryUrl(siteOrigin);
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;

  const bodyHtml = [
    renderBrandEmailParagraph(
      `Здравствуйте, <strong>${escapeHtml(userName)}</strong>!`,
      "email-greeting",
    ),
    renderBrandEmailParagraph(
      "Добро пожаловать в <strong>АудиоЛад</strong>.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Мы сохранили ваши практики в личной Аудиотеке. Теперь вы сможете открыть их с телефона или компьютера, войдя с тем же email, который использовали при регистрации.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Сохраните это письмо — через него вы всегда сможете вернуться к своим практикам.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(libraryUrl, "Открыть мою Аудиотеку", {
      msoWidth: 360,
    }),
    renderBrandEmailParagraph(
      "Чтобы АудиоЛад не потерялся среди сообщений и ссылок, добавьте его на главный экран телефона. После входа в личном кабинете появится подсказка по установке.",
      "email-body",
      "24px 0 24px",
    ),
    renderBrandEmailDivider(),
    renderWelcomeLibraryFooterBlock(libraryUrl),
    renderBrandEmailParagraph("С заботой,", "email-body", "24px 0 0"),
    renderBrandEmailParagraph(
      "<strong>команда АудиоЛада</strong>",
      "email-body",
      "0",
    ),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: WELCOME_EMAIL_SUBJECT,
    preheader: WELCOME_EMAIL_PREHEADER,
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что зарегистрировались в АудиоЛад.",
    ],
  });
}

export function renderWelcomeEmailText(input: WelcomeEmailInput): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const userName = input.userName.trim() || "друг";
  const libraryUrl = getWelcomeEmailLibraryUrl(siteOrigin);

  return [
    WELCOME_EMAIL_SUBJECT,
    "",
    `Здравствуйте, ${userName}!`,
    "",
    "Добро пожаловать в АудиоЛад.",
    "",
    "Мы сохранили ваши практики в личной Аудиотеке. Теперь вы сможете открыть их с телефона или компьютера, войдя с тем же email, который использовали при регистрации.",
    "",
    "Сохраните это письмо — через него вы всегда сможете вернуться к своим практикам.",
    "",
    "Открыть мою Аудиотеку:",
    libraryUrl,
    "",
    "Чтобы АудиоЛад не потерялся среди сообщений и ссылок, добавьте его на главный экран телефона. После входа в личном кабинете появится подсказка по установке.",
    "",
    "Все ваши практики хранятся в АудиоЛаде",
    "",
    "Открывайте свою Аудиотеку в любое время на audiolad.ru",
    libraryUrl,
    "",
    "С заботой,",
    "команда АудиоЛада",
    "",
    "© АудиоЛад, 2026. Все права защищены.",
    "Вы получили это письмо, потому что зарегистрировались в АудиоЛад.",
  ].join("\n");
}
