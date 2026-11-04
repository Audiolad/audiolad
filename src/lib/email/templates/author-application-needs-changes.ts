import { getAppOrigin } from "../../seo/app-origin";

import { escapeHtml } from "./escape-html";
import {
  renderBrandEmailCtaWithFallback,
  renderBrandEmailHeading,
  renderBrandEmailInfoBlock,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";

export const AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_SUBJECT =
  "Заявка автора – нужно кое-что поправить";
export const AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_TEMPLATE_KEY =
  "author_application_needs_changes";
export const AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_TEMPLATE_VERSION =
  "author-application-needs-changes-v1-20261104";

/** Keep in sync with AUTHOR_APPLICATION_REVISION_EDIT_PATH in author-applications/revision.ts. */
export const AUTHOR_APPLICATION_NEEDS_CHANGES_EDIT_PATH =
  "/become-author?revision=1#author-application-revision";

export type AuthorApplicationNeedsChangesEmailInput = {
  applicantName?: string | null;
  /** Full reviewer comment. Never truncated. */
  reviewComment: string;
  /** Labels of the form sections to fix (optional). */
  fieldLabels?: readonly string[];
  siteOrigin?: string;
};

function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br />");
}

export function getAuthorApplicationNeedsChangesEditUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, "")}${AUTHOR_APPLICATION_NEEDS_CHANGES_EDIT_PATH}`;
}

function resolveOrigin(input: AuthorApplicationNeedsChangesEmailInput): string {
  return (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
}

function resolveGreeting(input: AuthorApplicationNeedsChangesEmailInput): string {
  const name = input.applicantName?.trim() || "";
  return name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
}

function resolveFieldLabels(input: AuthorApplicationNeedsChangesEmailInput): string[] {
  return (input.fieldLabels ?? [])
    .map((label) => label.trim())
    .filter(Boolean);
}

const INTRO_TEXT =
  "Спасибо за заявку автора на АудиоЛаде. Мы посмотрели её и просим немного доработать – после этого сразу вернёмся к рассмотрению.";
const EDIT_TEXT =
  "Откройте заявку по кнопке ниже: форма уже заполнена вашими ответами, комментарий будет наверху. Поправьте нужное и нажмите «Отправить заявку повторно».";

export function renderAuthorApplicationNeedsChangesEmailHtml(
  input: AuthorApplicationNeedsChangesEmailInput,
): string {
  const siteOrigin = resolveOrigin(input);
  const logoUrl = `${siteOrigin}/brand/audiolad-logo-horizontal.png`;
  const editUrl = getAuthorApplicationNeedsChangesEditUrl(siteOrigin);
  const fieldLabels = resolveFieldLabels(input);

  const commentBlock = renderBrandEmailInfoBlock(
    [
      renderBrandEmailParagraph(
        "<strong>Комментарий команды</strong>",
        "email-list",
        "0 0 8px",
      ),
      renderBrandEmailParagraph(
        escapeHtmlMultiline(input.reviewComment.trim()),
        "email-list",
        "0",
      ),
    ].join(""),
  );

  const fieldsHtml =
    fieldLabels.length > 0
      ? renderBrandEmailParagraph(
          `Что поправить: ${fieldLabels.map((label) => escapeHtml(label)).join(", ")}.`,
          "email-body",
          "0 0 24px",
        )
      : "";

  const bodyHtml = [
    renderBrandEmailHeading("Заявку нужно доработать"),
    renderBrandEmailParagraph(escapeHtml(resolveGreeting(input)), "email-greeting"),
    renderBrandEmailParagraph(INTRO_TEXT, "email-body", "0 0 20px"),
    commentBlock,
    fieldsHtml,
    renderBrandEmailParagraph(EDIT_TEXT, "email-body", "0 0 24px"),
    renderBrandEmailCtaWithFallback(editUrl, "Открыть заявку"),
    renderBrandEmailParagraph(
      "Для редактирования нужно войти в аккаунт, с которого вы отправляли заявку.",
      "email-helper",
      "16px 0 0",
    ),
    renderBrandEmailParagraph("С уважением,", "email-body", "24px 0 0"),
    renderBrandEmailParagraph("<strong>Команда АудиоЛад</strong>", "email-body", "0"),
  ]
    .filter(Boolean)
    .join("\n\n                ");

  return renderBrandEmailShell({
    title: AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_SUBJECT,
    preheader: "Посмотрите комментарий команды и поправьте заявку.",
    logoUrl,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Вы получили это письмо, потому что подали заявку автора на АудиоЛаде.",
    ],
  });
}

export function renderAuthorApplicationNeedsChangesEmailText(
  input: AuthorApplicationNeedsChangesEmailInput,
): string {
  const siteOrigin = resolveOrigin(input);
  const editUrl = getAuthorApplicationNeedsChangesEditUrl(siteOrigin);
  const fieldLabels = resolveFieldLabels(input);

  return [
    AUTHOR_APPLICATION_NEEDS_CHANGES_EMAIL_SUBJECT,
    "",
    resolveGreeting(input),
    "",
    INTRO_TEXT,
    "",
    "Комментарий команды:",
    input.reviewComment.trim(),
    "",
    ...(fieldLabels.length > 0 ? [`Что поправить: ${fieldLabels.join(", ")}.`, ""] : []),
    EDIT_TEXT,
    "",
    `Открыть заявку: ${editUrl}`,
    "",
    "Для редактирования нужно войти в аккаунт, с которого вы отправляли заявку.",
    "",
    "С уважением,",
    "Команда АудиоЛад",
  ].join("\n");
}
