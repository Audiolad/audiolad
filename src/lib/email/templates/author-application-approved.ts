import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailButton,
  renderBrandEmailInfoBlock,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const AUTHOR_APPLICATION_APPROVED_EMAIL_SUBJECT =
  "Поздравляем! Ваша заявка одобрена 🎉";
export const AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY =
  "author_application_approved";
export const AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION =
  "author-application-approved-v1-20260722";

export const AUTHOR_APPLICATION_APPROVED_IMPORTANT_NOTE =
  "Если для связи вы указали email, отличный от email вашего аккаунта в АудиоЛаде, входить в кабинет автора нужно под тем аккаунтом, с которого была подана заявка.";

export type AuthorApplicationApprovedEmailInput = {
  siteOrigin?: string;
};

export function getAuthorDashboardUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/author-dashboard`;
}

const GETTING_STARTED_ITEMS = [
  "Оформите профиль автора — добавьте информацию о себе, аватар и баннер.",
  "Опубликуйте первый бесплатный аудиопродукт — так вы познакомитесь с процессом создания и публикации материалов.",
  "Проверьте публичную страницу автора — убедитесь, что профиль и аудиопродукт выглядят именно так, как вы задумали.",
] as const;

function renderGettingStartedChecklistHtml(): string {
  return renderBrandEmailInfoBlock(
    [
      renderBrandEmailParagraph("<strong>С чего начать</strong>", "email-body", "0 0 12px"),
      ...GETTING_STARTED_ITEMS.map((item, index) =>
        renderBrandEmailParagraph(
          `✅ ${item}`,
          "email-body",
          index === GETTING_STARTED_ITEMS.length - 1 ? "0" : "0 0 10px",
        ),
      ),
    ].join("\n"),
  );
}

function renderGettingStartedChecklistText(): string[] {
  return [
    "С чего начать",
    "",
    ...GETTING_STARTED_ITEMS.map((item) => `✅ ${item}`),
    "",
  ];
}

export function renderAuthorApplicationApprovedEmailHtml(
  input: AuthorApplicationApprovedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const dashboardUrl = getAuthorDashboardUrl(siteOrigin);

  const bodyHtml = [
    renderBrandEmailParagraph("Здравствуйте!", "email-greeting"),
    renderBrandEmailParagraph(
      "С радостью сообщаем, что ваша заявка на публикацию аудиоматериалов в <strong>АудиоЛаде</strong> одобрена.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Для вас уже открыт кабинет автора.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Теперь вы можете:",
      "email-body",
      "0 0 8px",
    ),
    renderBrandEmailParagraph(
      [
        "• публиковать свои аудиопродукты;",
        "• создавать бесплатные и платные программы;",
        "• объединять материалы в плейлисты;",
        "• отслеживать статистику прослушиваний;",
        "• постепенно развивать собственную библиотеку аудиоматериалов.",
      ].join("<br />"),
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailParagraph("<strong>Ваш следующий шаг</strong>", "email-body", "0 0 8px"),
    renderBrandEmailParagraph(
      "Мы рекомендуем начать с публикации первого бесплатного аудиопродукта.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Так вы сможете познакомиться с кабинетом автора, проверить весь процесс публикации и поделиться своей первой работой со слушателями.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(dashboardUrl, "Открыть кабинет автора", { msoWidth: 320 }),
    renderGettingStartedChecklistHtml(),
    renderBrandEmailInfoBlock(
      [
        renderBrandEmailParagraph("<strong>Важно</strong>", "email-body", "0 0 8px"),
        renderBrandEmailParagraph(
          AUTHOR_APPLICATION_APPROVED_IMPORTANT_NOTE,
          "email-body",
          "0",
        ),
      ].join("\n"),
    ),
    renderBrandEmailParagraph(
      "Если у вас возникнут вопросы, просто ответьте на это письмо.",
      "email-body",
      "24px 0 0",
    ),
    renderBrandEmailParagraph(
      "Спасибо, что стали одним из первых авторов АудиоЛада!",
      "email-body",
    ),
    renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
    renderBrandEmailParagraph("<strong>Команда АудиоЛад</strong>", "email-body", "0"),
    renderBrandEmailParagraph(
      `<a href="${siteOrigin}" style="color:#5E2CA5;text-decoration:none;">audiolad.ru</a>`,
      "email-body",
      "0",
    ),
  ].join("\n\n                ");

  return renderBrandEmailShell({
    title: "Заявка на авторство одобрена",
    preheader: AUTHOR_APPLICATION_APPROVED_EMAIL_SUBJECT,
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что ваша заявка на авторство была одобрена.",
    ],
  });
}

export function renderAuthorApplicationApprovedEmailText(
  input: AuthorApplicationApprovedEmailInput = {},
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const dashboardUrl = getAuthorDashboardUrl(siteOrigin);

  return [
    AUTHOR_APPLICATION_APPROVED_EMAIL_SUBJECT,
    "",
    "Здравствуйте!",
    "",
    "С радостью сообщаем, что ваша заявка на публикацию аудиоматериалов в АудиоЛаде одобрена.",
    "Для вас уже открыт кабинет автора.",
    "",
    "Теперь вы можете:",
    "• публиковать свои аудиопродукты;",
    "• создавать бесплатные и платные программы;",
    "• объединять материалы в плейлисты;",
    "• отслеживать статистику прослушиваний;",
    "• постепенно развивать собственную библиотеку аудиоматериалов.",
    "",
    "Ваш следующий шаг",
    "",
    "Мы рекомендуем начать с публикации первого бесплатного аудиопродукта.",
    "Так вы сможете познакомиться с кабинетом автора, проверить весь процесс публикации и поделиться своей первой работой со слушателями.",
    "",
    `Открыть кабинет автора: ${dashboardUrl}`,
    "",
    ...renderGettingStartedChecklistText(),
    "Важно",
    AUTHOR_APPLICATION_APPROVED_IMPORTANT_NOTE,
    "",
    "Если у вас возникнут вопросы, просто ответьте на это письмо.",
    "",
    "Спасибо, что стали одним из первых авторов АудиоЛада!",
    "",
    "С уважением,",
    "Команда АудиоЛад",
    "audiolad.ru",
    "",
    "© АудиоЛад, 2026. Все права защищены.",
    "Вы получили это письмо, потому что ваша заявка на авторство была одобрена.",
  ].join("\n");
}
