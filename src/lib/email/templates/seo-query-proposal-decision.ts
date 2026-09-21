import { getAppOrigin } from "@/lib/seo/app-origin";

import {
  renderBrandEmailCtaWithFallback,
  renderBrandEmailHeading,
  renderBrandEmailParagraph,
  renderBrandEmailShell,
} from "./brand-layout";
import { escapeHtml } from "./escape-html";

export const SEO_QUERY_PROPOSAL_APPROVED_EMAIL_TEMPLATE_KEY =
  "seo_query_proposal_approved_author";
export const SEO_QUERY_PROPOSAL_APPROVED_EMAIL_TEMPLATE_VERSION =
  "seo-query-proposal-approved-author-v1-20260921";
export const SEO_QUERY_PROPOSAL_REJECTED_EMAIL_TEMPLATE_KEY =
  "seo_query_proposal_rejected_author";
export const SEO_QUERY_PROPOSAL_REJECTED_EMAIL_TEMPLATE_VERSION =
  "seo-query-proposal-rejected-author-v1-20260921";

export type SeoQueryProposalApprovedEmailInput = {
  queryText: string;
  frequencyLabel: string;
  expiresAtLabel: string;
  createProductUrl: string;
  siteOrigin?: string;
};

export type SeoQueryProposalRejectedEmailInput = {
  queryText: string;
  opportunitiesUrl: string;
  siteOrigin?: string;
};

export function buildSeoQueryProposalApprovedSubject(queryText: string): string {
  return `Ваш поисковый запрос одобрен — ${queryText.trim() || "запрос"}`;
}

export function buildSeoQueryProposalRejectedSubject(queryText: string): string {
  return `Поисковый запрос не одобрен — ${queryText.trim() || "запрос"}`;
}

export function renderSeoQueryProposalApprovedEmailHtml(
  input: SeoQueryProposalApprovedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const bodyHtml = [
    renderBrandEmailHeading("Запрос одобрен и закреплён"),
    renderBrandEmailParagraph(
      "Ваш поисковый запрос одобрен и закреплён за вами на 7 дней. Теперь вы можете создать аудиопродукт под этот запрос.",
      "email-body",
      "0 0 16px",
    ),
    renderBrandEmailParagraph(
      [
        `<strong>Запрос:</strong> ${escapeHtml(input.queryText)}`,
        `<strong>Частотность:</strong> ${escapeHtml(input.frequencyLabel)}`,
        `<strong>Закреплён до:</strong> ${escapeHtml(input.expiresAtLabel)}`,
      ].join("<br><br>"),
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailCtaWithFallback(input.createProductUrl, "Создать продукт"),
  ].join("");

  return renderBrandEmailShell({
    title: "Запрос одобрен",
    preheader: buildSeoQueryProposalApprovedSubject(input.queryText),
    logoUrl: `${siteOrigin}/brand/audiolad-logo-horizontal.png`,
    bodyHtml,
    footerLines: ["© АудиоЛад, 2026. Все права защищены."],
  });
}

export function renderSeoQueryProposalApprovedEmailText(
  input: SeoQueryProposalApprovedEmailInput,
): string {
  return [
    buildSeoQueryProposalApprovedSubject(input.queryText),
    "",
    "Ваш поисковый запрос одобрен и закреплён за вами на 7 дней.",
    "Теперь вы можете создать аудиопродукт под этот запрос.",
    "",
    `Запрос: ${input.queryText}`,
    `Частотность: ${input.frequencyLabel}`,
    `Закреплён до: ${input.expiresAtLabel}`,
    "",
    `Создать продукт: ${input.createProductUrl}`,
  ].join("\n");
}

export function renderSeoQueryProposalRejectedEmailHtml(
  input: SeoQueryProposalRejectedEmailInput,
): string {
  const siteOrigin = (input.siteOrigin ?? getAppOrigin()).replace(/\/$/, "");
  const bodyHtml = [
    renderBrandEmailHeading("Запрос не одобрен"),
    renderBrandEmailParagraph(
      "Запрос не был добавлен в доступные SEO-возможности АудиоЛада. Вы можете выбрать другой поисковый запрос.",
      "email-body",
      "0 0 16px",
    ),
    renderBrandEmailParagraph(
      `<strong>Запрос:</strong> ${escapeHtml(input.queryText)}`,
      "email-body",
      "0 0 24px",
    ),
    renderBrandEmailCtaWithFallback(
      input.opportunitiesUrl,
      "Выбрать другой запрос",
    ),
  ].join("");

  return renderBrandEmailShell({
    title: "Запрос не одобрен",
    preheader: buildSeoQueryProposalRejectedSubject(input.queryText),
    logoUrl: `${siteOrigin}/brand/audiolad-logo-horizontal.png`,
    bodyHtml,
    footerLines: ["© АудиоЛад, 2026. Все права защищены."],
  });
}

export function renderSeoQueryProposalRejectedEmailText(
  input: SeoQueryProposalRejectedEmailInput,
): string {
  return [
    buildSeoQueryProposalRejectedSubject(input.queryText),
    "",
    "Запрос не был добавлен в доступные SEO-возможности АудиоЛада.",
    "Вы можете выбрать другой поисковый запрос.",
    "",
    `Запрос: ${input.queryText}`,
    "",
    `Выбрать другой запрос: ${input.opportunitiesUrl}`,
  ].join("\n");
}
