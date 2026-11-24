import type { Metadata } from "next";

import { SERGEY_CONTACT } from "@/lib/business-app/sergey-contact";
import {
  BUSINESS_CERTIFICATE_SAMPLE_CANONICAL,
  BUSINESS_CERTIFICATE_SAMPLE_LEGACY,
  certificateDisplayNumber,
  isSampleCertificateNumber,
  normalizeBusinessLegalCertificateNumber,
} from "@/lib/business/legal/certificate-number";

export { normalizeBusinessLegalCertificateNumber, BUSINESS_CERTIFICATE_SAMPLE_LEGACY };

/**
 * Правовой раздел «АудиоЛад Кофейня» – audiolad.ru/b/coffee/legal (t1544u, t1567u).
 * Раздел скрыт от поиска: noindex, nofollow, нет в sitemap, нет ссылок из меню и подвала сайта.
 * Открывается по прямой ссылке; на него ссылается кабинет владельца (договор, сертификат заведения)
 * и QR-код сертификата (t1591u), а также подвал гостевой страницы coffee.audiolad.ru (t1667u).
 */
export const BUSINESS_LEGAL_HREF = "/b/coffee/legal";
export const BUSINESS_LEGAL_RIGHTS_HREF = "/b/coffee/legal/prava";
export const BUSINESS_LEGAL_PROTECTION_HREF = "/b/coffee/legal/zashchita";
export const BUSINESS_LEGAL_CERTIFICATE_HREF = "/b/coffee/legal/sertifikat";
/** Договор-оферта «АудиоЛад Кофейня», ред. 5, с приложениями 1–4 (t1620u / t1621u). */
export const BUSINESS_LEGAL_OFFER_HREF = "/b/coffee/legal/oferta";

/** Сайт раздела: кабинет живёт на coffee./business., раздел – на audiolad.ru. */
export const BUSINESS_LEGAL_SITE = "https://audiolad.ru";
export function businessLegalAbsoluteUrl(path: string): string {
  return `${BUSINESS_LEGAL_SITE}${path}`;
}
/** Файлы ред. 5 (тот же текст, что docs/business/public/business-offer.md). Ред. 4 и ред. 3 остаются по прежним путям. */
export const BUSINESS_LEGAL_OFFER_PDF_PATH = "/b-legal/dogovor-oferta-audiolad-kofeynya-red5.pdf";
export const BUSINESS_LEGAL_OFFER_DOCX_PATH = "/b-legal/dogovor-oferta-audiolad-kofeynya-red5.docx";
export const BUSINESS_LEGAL_OFFER_PDF = businessLegalAbsoluteUrl(BUSINESS_LEGAL_OFFER_PDF_PATH);

export const BUSINESS_LEGAL_PATHS = [
  BUSINESS_LEGAL_HREF,
  BUSINESS_LEGAL_OFFER_HREF,
  BUSINESS_LEGAL_RIGHTS_HREF,
  BUSINESS_LEGAL_PROTECTION_HREF,
  BUSINESS_LEGAL_CERTIFICATE_HREF,
] as const;

/** Редакция договора-оферты, на которую ссылается раздел (решение Сергея, t1551u). */
export const BUSINESS_LEGAL_OFFER_EDITION = "19.11.2026";

/** Сроки (t1551u): заведение сообщает об обращении – 5 рабочих дней; мы отвечаем – 3 рабочих дня. */
export const BUSINESS_LEGAL_NOTIFY_DAYS = 5;
export const BUSINESS_LEGAL_RESPONSE_DAYS = 3;

/** Контакты (t1554u): почта, телефон и МАКС Сергея. */
export const BUSINESS_LEGAL_CONTACT = {
  email: SERGEY_CONTACT.email,
  emailHref: SERGEY_CONTACT.emailHref,
  phoneDisplay: "+7 926 411-13-81",
  phoneHref: SERGEY_CONTACT.phoneHref,
  maxDisplay: "+7 926 411-13-81",
  maxHref: SERGEY_CONTACT.maxHref,
} as const;

export const BUSINESS_LEGAL_OPERATOR = {
  name: "ИП Петров Сергей Сергеевич",
  inn: "507305817690",
  ogrnip: "316505300063237",
} as const;

export const BUSINESS_LEGAL_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
};

export type BusinessLegalCertificate = {
  number: string;
  urlNumber: string;
  isSample: true;
  issuedAt: string;
  validUntil: string;
  licensee: string;
  venue: string;
  venueAddress: string;
  catalog: string;
};

/** Образец (данные вымышлены). Настоящие сертификаты – в базе (business_venue_certificates, t1591u). */
export const BUSINESS_LEGAL_SAMPLE_CERTIFICATE: BusinessLegalCertificate = {
  number: certificateDisplayNumber(BUSINESS_CERTIFICATE_SAMPLE_CANONICAL),
  urlNumber: BUSINESS_CERTIFICATE_SAMPLE_CANONICAL,
  isSample: true,
  issuedAt: "19.11.2026",
  validUntil: "19.12.2026",
  licensee: "ООО «Кофейня Пример»",
  venue: "Кофейня «Пример» на Примерной",
  venueAddress: "000000, г. Город, ул. Примерная, д. 1",
  catalog: "«АудиоЛад Кофейня»",
};

export const BUSINESS_LEGAL_SAMPLE_PDF = "/b-legal/sertifikat-zavedeniya-obrazec.pdf";
export const BUSINESS_LEGAL_SAMPLE_PNG = "/b-legal/sertifikat-zavedeniya-obrazec.png";

export function businessLegalCertificateHref(urlNumber: string): string {
  return `${BUSINESS_LEGAL_CERTIFICATE_HREF}/${encodeURIComponent(urlNumber)}`;
}

/** ALK-2026-000001 / АЛК-… / AL-483271 / «АудиоЛад № 483 271» → точный ключ; иначе null.
 *  Старые адреса образца ALK-2026-000001 тоже принимаются. */
export function findBusinessLegalCertificate(raw: string): BusinessLegalCertificate | null {
  return isSampleCertificateNumber(raw) ? BUSINESS_LEGAL_SAMPLE_CERTIFICATE : null;
}
