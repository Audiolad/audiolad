import { getAppOrigin } from "../../seo/app-origin";
import { renderBrandEmailParagraph, renderBrandEmailShell } from "./brand-layout";

export const BUSINESS_CATALOG_APPROVED_TEMPLATE_KEY = "business_catalog_approved";
export const BUSINESS_CATALOG_APPROVED_TEMPLATE_VERSION = "business-catalog-approved-v1";
export const BUSINESS_CATALOG_APPROVED_SUBJECT = "Ваш каталог музыки допущен в АудиоЛад Бизнес";
export const BUSINESS_CATALOG_APPROVED_TEXT = "Поздравляем! Ваши права на музыкальный каталог подтверждены. Ваш каталог музыки допущен к участию в программе АудиоЛад Бизнес. Спасибо, что вы с нами! Команда АудиоЛада";

export function renderBusinessCatalogApprovedEmailHtml(): string {
  return renderBrandEmailShell({
    title: BUSINESS_CATALOG_APPROVED_SUBJECT,
    preheader: BUSINESS_CATALOG_APPROVED_SUBJECT,
    logoUrl: `${getAppOrigin().replace(/\/$/, "")}/brand/audiolad-logo-horizontal.png`,
    bodyHtml: renderBrandEmailParagraph(BUSINESS_CATALOG_APPROVED_TEXT, "email-body"),
    footerLines: [],
  });
}
