import { buildAuthorPublicPath } from "@/lib/products/paths";

/** Confirmed public seller data from /requisites. Do not invent extra profiles. */
export const ORGANIZATION_LEGAL_NAME =
  "Индивидуальный предприниматель Петров Сергей Сергеевич";
export const ORGANIZATION_EMAIL = "1@audiolad.ru";
export const ORGANIZATION_TAX_ID = "507305817690";
export const ORGANIZATION_FOUNDER_NAME = "Сергей Петров";
export const ORGANIZATION_FOUNDER_SLUG = "sergey-petrov";

export function buildOrganizationFounderPath(): string {
  return buildAuthorPublicPath(ORGANIZATION_FOUNDER_SLUG);
}
