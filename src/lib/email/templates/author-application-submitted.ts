import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailInfoBlock,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const AUTHOR_APPLICATION_SUBMITTED_EMAIL_SUBJECT =
  "Мы получили вашу заявку на авторство в АудиоЛаде";
export const AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_KEY =
  "author_application_submitted";
export const AUTHOR_APPLICATION_SUBMITTED_EMAIL_TEMPLATE_VERSION =
  "author-application-submitted-v2-20260722";

export const AUTHOR_APPLICATION_SUBMITTED_IMPORTANT_NOTE =
  "Если для связи вы указали email, отличный от email вашего аккаунта в АудиоЛаде, после одобрения заявки входить в кабинет автора нужно будет под тем аккаунтом, с которого была подана заявка.";

export type AuthorApplicationSubmittedEmailInput = {
  siteOrigin?: string;
};

export function renderAuthorApplicationSubmittedEmailHtml(
  input: AuthorApplicationSubmittedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;

  const bodyHtml = [
    renderBrandEmailHeading("Мы получили вашу заявку"),
    renderBrandEmailParagraph("Здравствуйте!", "email-greeting"),
    renderBrandEmailParagraph(
      "Спасибо, что подали заявку на публикацию своих аудиоматериалов в <strong>АудиоЛаде</strong>.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Мы получили вашу заявку и уже передали её на рассмотрение.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "После проверки мы отправим вам ещё одно письмо с результатом. Если заявка будет одобрена, вы получите доступ к кабинету автора, где сможете публиковать свои аудиопродукты и управлять ими.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailInfoBlock(
      [
        renderBrandEmailParagraph("<strong>Важно</strong>", "email-body", "0 0 8px"),
        renderBrandEmailParagraph(
          AUTHOR_APPLICATION_SUBMITTED_IMPORTANT_NOTE,
          "email-body",
          "0",
        ),
      ].join("\n"),
    ),
    renderBrandEmailParagraph(
      "Мы очень рады, что вы решили стать одним из первых авторов АудиоЛада. Спасибо за доверие — вместе мы создаём библиотеку качественных аудиоматериалов, которые помогут тысячам людей.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(siteOrigin, "Перейти в АудиоЛад", { msoWidth: 320 }),
    renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
    renderBrandEmailParagraph("<strong>Команда АудиоЛад</strong>", "email-body", "0"),
    renderBrandEmailParagraph(
      `<a href="${siteOrigin}" style="color:#5E2CA5;text-decoration:none;">audiolad.ru</a>`,
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailParagraph(
      "<em>P.S. Пока заявка рассматривается, вы можете познакомиться с платформой и возможностями сервиса.</em>",
      "email-body",
      "0",
    ),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: "Заявка на авторство принята",
    preheader: AUTHOR_APPLICATION_SUBMITTED_EMAIL_SUBJECT,
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что подали заявку на авторство в АудиоЛаде.",
    ],
  });
}

export function renderAuthorApplicationSubmittedEmailText(
  input: AuthorApplicationSubmittedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");

  return [
    AUTHOR_APPLICATION_SUBMITTED_EMAIL_SUBJECT,
    "",
    "Здравствуйте!",
    "",
    "Спасибо, что подали заявку на публикацию своих аудиоматериалов в АудиоЛаде.",
    "Мы получили вашу заявку и уже передали её на рассмотрение.",
    "",
    "После проверки мы отправим вам ещё одно письмо с результатом. Если заявка будет одобрена, вы получите доступ к кабинету автора, где сможете публиковать свои аудиопродукты и управлять ими.",
    "",
    "Важно",
    AUTHOR_APPLICATION_SUBMITTED_IMPORTANT_NOTE,
    "",
    "Мы очень рады, что вы решили стать одним из первых авторов АудиоЛада. Спасибо за доверие — вместе мы создаём библиотеку качественных аудиоматериалов, которые помогут тысячам людей.",
    "",
    `Перейти в АудиоЛад: ${siteOrigin}`,
    "",
    "С уважением,",
    "Команда АудиоЛад",
    "audiolad.ru",
    "",
    "P.S. Пока заявка рассматривается, вы можете познакомиться с платформой и возможностями сервиса.",
    "",
    "© АудиоЛад, 2026. Все права защищены.",
    "Вы получили это письмо, потому что подали заявку на авторство в АудиоЛаде.",
  ].join("\n");
}
