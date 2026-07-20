import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailBulletLinks,
  renderBrandEmailButton,
  renderBrandEmailDivider,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const WELCOME_EMAIL_SUBJECT = "Добро пожаловать в АудиоЛад 🎉";
export const WELCOME_EMAIL_TEMPLATE_KEY = "welcome";
export const WELCOME_EMAIL_TEMPLATE_VERSION = "typography-v4-20260720";

export type WelcomeEmailInput = {
  userName: string;
  siteOrigin?: string;
};

export function getWelcomeEmailLinks(siteOrigin: string) {
  return [
    { label: "Каталог", href: `${siteOrigin}/catalog` },
    { label: "Моя аудиотека", href: `${siteOrigin}/my-practices` },
    { label: "Плейлисты", href: `${siteOrigin}/playlists` },
    { label: "Страница авторов", href: `${siteOrigin}/authors` },
  ];
}

export function renderWelcomeEmailHtml(input: WelcomeEmailInput): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const userName = input.userName.trim() || "друг";
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;

  const bodyHtml = [
    renderBrandEmailHeading("Добро пожаловать в АудиоЛад!"),
    renderBrandEmailParagraph(
      `Здравствуйте, <strong>${escapeHtml(userName)}</strong>!`,
      "email-greeting",
    ),
    renderBrandEmailParagraph(
      "Спасибо за регистрацию в сервисе <strong>АудиоЛад</strong>.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Мы очень рады видеть вас среди наших пользователей.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "В вашем аккаунте уже доступны бесплатные практики, плейлисты и каталог аудиопрограмм.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Начать прослушивание можно прямо сейчас.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(siteOrigin, "Открыть АудиоЛад", { msoWidth: 320 }),
    renderBrandEmailDivider(),
    renderBrandEmailBulletLinks("Полезные ссылки", getWelcomeEmailLinks(siteOrigin)),
    renderBrandEmailParagraph(
      "Если у вас появятся вопросы или предложения — просто ответьте на это письмо.",
      "email-body",
    ),
    renderBrandEmailParagraph("Желаем приятного прослушивания!", "email-body"),
    renderBrandEmailParagraph("<strong>Команда АудиоЛад</strong>", "email-body", "0"),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: "Добро пожаловать в АудиоЛад",
    preheader: WELCOME_EMAIL_SUBJECT,
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

  const links = getWelcomeEmailLinks(siteOrigin)
    .map((link) => `• ${link.label}: ${link.href}`)
    .join("\n");

  return [
    "Добро пожаловать в АудиоЛад!",
    "",
    `Здравствуйте, ${userName}!`,
    "",
    "Спасибо за регистрацию в сервисе АудиоЛад.",
    "Мы очень рады видеть вас среди наших пользователей.",
    "",
    "В вашем аккаунте уже доступны бесплатные практики, плейлисты и каталог аудиопрограмм.",
    "Начать прослушивание можно прямо сейчас.",
    "",
    `Открыть АудиоЛад: ${siteOrigin}`,
    "",
    "Полезные ссылки",
    links,
    "",
    "Если у вас появятся вопросы или предложения — просто ответьте на это письмо.",
    "Желаем приятного прослушивания!",
    "",
    "Команда АудиоЛад",
    "",
    "© АудиоЛад, 2026. Все права защищены.",
    "Вы получили это письмо, потому что зарегистрировались в АудиоЛад.",
  ].join("\n");
}
