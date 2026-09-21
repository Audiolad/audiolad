import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailCtaWithFallback,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const SEO_QUERY_PROPOSAL_ADMIN_ALERT_EMAIL_TEMPLATE_KEY =
  "seo_query_proposal_admin_alert";
export const SEO_QUERY_PROPOSAL_ADMIN_ALERT_EMAIL_TEMPLATE_VERSION =
  "seo-query-proposal-admin-alert-v1-20260921";

export type SeoQueryProposalAdminAlertEmailInput = {
  authorName: string;
  queryText: string;
  frequencyLabel: string;
  sourceLabel: string;
  submittedAtLabel: string;
  queryId: string;
  siteOrigin?: string;
};

export function buildSeoQueryProposalAdminAlertSubject(queryText: string): string {
  const trimmed = queryText.trim() || "поисковый запрос";
  return `Новый SEO-запрос на проверке — ${trimmed}`;
}

export function getSeoQueryAdminReviewUrl(
  queryId: string,
  siteOrigin?: string,
): string {
  const origin = (siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  return `${origin}/admin/seo-queries#seo-query-${queryId}`;
}

export function renderSeoQueryProposalAdminAlertEmailHtml(
  input: SeoQueryProposalAdminAlertEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const reviewUrl = getSeoQueryAdminReviewUrl(input.queryId, siteOrigin);
  const authorName = input.authorName.trim() || "Автор";
  const bodyHtml = [
    renderBrandEmailHeading("Новый SEO-запрос на проверке"),
    renderBrandEmailParagraph(
      `Авторский проект «<strong>${escapeHtml(authorName)}</strong>» предложил новый поисковый запрос.`,
      "email-body",
      "0 0 16px",
    ),
    renderBrandEmailParagraph(
      [
        `<strong>Запрос:</strong> ${escapeHtml(input.queryText)}`,
        `<strong>Частотность:</strong> ${escapeHtml(input.frequencyLabel)}`,
        `<strong>Источник:</strong> ${escapeHtml(input.sourceLabel)}`,
        `<strong>Дата отправки:</strong> ${escapeHtml(input.submittedAtLabel)}`,
      ].join("<br><br>"),
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailCtaWithFallback(reviewUrl, "Проверить запрос"),
  ].join("");

  return renderBrandEmailShell({
    title: "Новый SEO-запрос на проверке",
    preheader: buildSeoQueryProposalAdminAlertSubject(input.queryText),
    logoUrl: `${siteOrigin}/brand/audiolad-logo-horizontal.png`,
    bodyHtml,
    footerLines: [
      "© АудиоЛад, 2026. Все права защищены.",
      "Служебное уведомление административной панели АудиоЛад.",
    ],
  });
}

export function renderSeoQueryProposalAdminAlertEmailText(
  input: SeoQueryProposalAdminAlertEmailInput,
): string {
  const reviewUrl = getSeoQueryAdminReviewUrl(input.queryId, input.siteOrigin);
  return [
    buildSeoQueryProposalAdminAlertSubject(input.queryText),
    "",
    `Авторский проект «${input.authorName.trim() || "Автор"}» предложил новый поисковый запрос.`,
    "",
    `Запрос: ${input.queryText}`,
    `Частотность: ${input.frequencyLabel}`,
    `Источник: ${input.sourceLabel}`,
    `Дата отправки: ${input.submittedAtLabel}`,
    "",
    `Проверить запрос: ${reviewUrl}`,
  ].join("\n");
}
