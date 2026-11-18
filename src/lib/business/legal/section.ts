import type { Metadata } from "next";

import { SERGEY_CONTACT } from "@/lib/business-app/sergey-contact";

/**
 * Правовой раздел «АудиоЛад Бизнес» – audiolad.ru/b/legal (t1544u).
 * Пока раздел скрыт: noindex, nofollow, нет в sitemap, нет ссылок из меню,
 * подвала и других страниц. Открывает только Сергей.
 */
export const BUSINESS_LEGAL_HREF = "/b/legal";
export const BUSINESS_LEGAL_RIGHTS_HREF = "/b/legal/prava";
export const BUSINESS_LEGAL_PROTECTION_HREF = "/b/legal/zashchita";
export const BUSINESS_LEGAL_CERTIFICATE_HREF = "/b/legal/sertifikat";

export const BUSINESS_LEGAL_PATHS = [
  BUSINESS_LEGAL_HREF,
  BUSINESS_LEGAL_RIGHTS_HREF,
  BUSINESS_LEGAL_PROTECTION_HREF,
  BUSINESS_LEGAL_CERTIFICATE_HREF,
] as const;

/** Редакция договора-оферты, на которую ссылается раздел (решение Сергея, t1551u). */
export const BUSINESS_LEGAL_OFFER_EDITION = "18.11.2026";

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

/** Образец (данные вымышлены). Настоящих сертификатов в базе пока нет. */
export const BUSINESS_LEGAL_SAMPLE_CERTIFICATE: BusinessLegalCertificate = {
  number: "АЛК-2026-000001",
  urlNumber: "ALK-2026-000001",
  isSample: true,
  issuedAt: "18.11.2026",
  validUntil: "18.12.2026",
  licensee: "ООО «Кофейня Пример»",
  venue: "Кофейня «Пример» на Примерной",
  venueAddress: "000000, г. Город, ул. Примерная, д. 1",
  catalog: "«АудиоЛад Кофейня»",
};

export const BUSINESS_LEGAL_SAMPLE_PDF = "/b-legal/sertifikat-tochki-obrazec.pdf";
export const BUSINESS_LEGAL_SAMPLE_PNG = "/b-legal/sertifikat-tochki-obrazec.png";

export function businessLegalCertificateHref(urlNumber: string): string {
  return `${BUSINESS_LEGAL_CERTIFICATE_HREF}/${encodeURIComponent(urlNumber)}`;
}

/** ALK-2026-000001 / alk-2026-000001 / АЛК-2026-000001 → ALK-2026-000001; иначе null. */
export function normalizeBusinessLegalCertificateNumber(raw: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  value = value.trim().toUpperCase().replace(/^АЛК/u, "ALK");
  return /^ALK-\d{4}-\d{6}$/.test(value) ? value : null;
}

export function findBusinessLegalCertificate(raw: string): BusinessLegalCertificate | null {
  const normalized = normalizeBusinessLegalCertificateNumber(raw);
  if (!normalized) return null;
  return normalized === BUSINESS_LEGAL_SAMPLE_CERTIFICATE.urlNumber ? BUSINESS_LEGAL_SAMPLE_CERTIFICATE : null;
}
