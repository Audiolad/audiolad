import { getAppOrigin } from "@/lib/seo/app-origin";

import { AUTHOR_APPLICATION_SUBMITTED_IMPORTANT_NOTE } from "./author-application-submitted";
import {
  renderBrandEmailButton,
  renderBrandEmailHeading,
  renderBrandEmailInfoBlock,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const AUTHOR_APPLICATION_APPROVED_EMAIL_SUBJECT =
  "Поздравляем! Ваша заявка одобрена 🎉";
export const AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY =
  "author_application_approved";
export const AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_VERSION =
  "author-application-approved-v3-20260804";

export type AuthorApplicationApprovedEmailInput = {
  siteOrigin?: string;
};

export function getAuthorDashboardUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/author-dashboard`;
}

function renderGettingStartedChecklistHtml(): string {
  const items = [
    "<strong>Оформите профиль автора</strong> — добавьте информацию о себе, аватар и баннер.",
    "<strong>Опубликуйте первый бесплатный аудиопродукт</strong> — это обязательный шаг перед заявкой на коммерческий статус. Подойдёт практика, музыка или альбом.",
    "<strong>Проверьте публичную страницу автора</strong> — убедитесь, что профиль и аудиопродукт выглядят именно так, как вы задумали.",
  ];

  return renderBrandEmailInfoBlock(
    [
      renderBrandEmailParagraph("<strong>С чего начать</strong>", "email-body", "0 0 12px"),
      ...items.map((item, index) =>
        renderBrandEmailParagraph(
          `${index + 1}. ${item}`,
          "email-body",
          index === items.length - 1 ? "0" : "0 0 10px",
        ),
      ),
    ].join("\n"),
  );
}

function renderGettingStartedChecklistText(): string[] {
  return [
    "С чего начать",
    "",
    "1. Оформите профиль автора — добавьте информацию о себе, аватар и баннер.",
    "2. Опубликуйте первый бесплатный аудиопродукт — это обязательный шаг перед заявкой на коммерческий статус. Подойдёт практика, музыка или альбом.",
    "3. Проверьте публичную страницу автора — убедитесь, что профиль и аудиопродукт выглядят именно так, как вы задумали.",
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
    renderBrandEmailHeading("Ваша заявка одобрена"),
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
      "Сначала опубликуйте бесплатный аудиопродукт. После публикации можно подать заявку на коммерческий статус.",
      "email-body",
    ),
    renderBrandEmailParagraph(
      "Так вы познакомитесь с кабинетом автора, проверите процесс публикации и откроете путь к коммерческому подключению. Подойдёт бесплатная практика, музыка или альбом.",
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailButton(dashboardUrl, "Открыть кабинет автора", { msoWidth: 320 }),
    renderGettingStartedChecklistHtml(),
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
    "Сначала опубликуйте бесплатный аудиопродукт. После публикации можно подать заявку на коммерческий статус.",
    "Так вы познакомитесь с кабинетом автора, проверите процесс публикации и откроете путь к коммерческому подключению. Подойдёт бесплатная практика, музыка или альбом.",
    "",
    `Открыть кабинет автора: ${dashboardUrl}`,
    "",
    ...renderGettingStartedChecklistText(),
    "Важно",
    AUTHOR_APPLICATION_SUBMITTED_IMPORTANT_NOTE,
    "",
    "Если у вас возникнут вопросы, просто ответьте на это письмо.",
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
