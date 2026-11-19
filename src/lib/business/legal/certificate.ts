import { createHash } from "node:crypto";

import { BUSINESS_LEGAL_OPERATOR } from "./section";

/**
 * Сертификат точки (оферта «АудиоЛад Кофейня», ред. 3, приложение 2; t1591u).
 * Снимок данных фиксируется при выдаче. Новый номер выдаётся, когда снимок меняется:
 * новый период доступа, адрес или название точки, ИНН, принятая редакция договора.
 * Проверка: audiolad.ru/b/coffee/legal/sertifikat/<номер>.
 */

export const BUSINESS_CERTIFICATE_CATALOG = "каталог «АудиоЛад Кофейня»";
export const BUSINESS_CERTIFICATE_GENERATORS = "MusicGPT и другие сервисы генерации музыки";
export const BUSINESS_CERTIFICATE_SITE = "https://audiolad.ru";

export type CertificatePeriodKind = "gift" | "subscription";

export type CertificateSnapshot = {
  v: 1;
  venueName: string;
  venueAddress: string;
  licensee: { kind: "ul" | "ip"; name: string; fullName: string; inn: string; ogrn: string };
  accountCode: string;
  period: { kind: CertificatePeriodKind; start: string | null; end: string };
  offer: { version: string; label: string; acceptedAt: string };
};

export type CertificateMissing = "inn" | "inn_inactive" | "registry" | "address" | "offer" | "access" | "revoked";

/** «7F3A-21C9»: первые 8 знаков номера организации – номер учётной записи в сертификате. */
export function businessAccountCode(organizationId: string): string {
  const hex = organizationId.replace(/[^0-9a-f]/gi, "").slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/** Стабильный JSON: ключи в фиксированном порядке, как в типе. */
export function certificateSnapshotJson(s: CertificateSnapshot): string {
  return JSON.stringify({
    v: s.v,
    venueName: s.venueName,
    venueAddress: s.venueAddress,
    licensee: {
      kind: s.licensee.kind,
      name: s.licensee.name,
      fullName: s.licensee.fullName,
      inn: s.licensee.inn,
      ogrn: s.licensee.ogrn,
    },
    accountCode: s.accountCode,
    period: { kind: s.period.kind, start: s.period.start, end: s.period.end },
    offer: { version: s.offer.version, label: s.offer.label, acceptedAt: s.offer.acceptedAt },
  });
}

export function certificateSnapshotHash(s: CertificateSnapshot): string {
  return createHash("sha256").update(certificateSnapshotJson(s), "utf8").digest("hex");
}

export function parseCertificateSnapshot(raw: unknown): CertificateSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as CertificateSnapshot;
  if (s.v !== 1 || typeof s.venueName !== "string" || typeof s.venueAddress !== "string") return null;
  if (!s.licensee || typeof s.licensee.inn !== "string" || typeof s.licensee.name !== "string") return null;
  if (!s.period || typeof s.period.end !== "string" || !s.offer || typeof s.offer.version !== "string") return null;
  return s;
}

/** ALK-2026-000002 → «АЛК-2026-000002» для печати (в адресе страницы – латиница). */
export function certificateDisplayNumber(number: string): string {
  return number.replace(/^ALK/, "АЛК");
}

export function certificateCheckUrl(number: string): string {
  return `${BUSINESS_CERTIFICATE_SITE}/b/coffee/legal/sertifikat/${number}`;
}

const MOSCOW_DATE = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function moscowDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? MOSCOW_DATE.format(d) : null;
}

export function periodKindLabel(kind: CertificatePeriodKind): string {
  return kind === "gift" ? "подарочный период" : "оплаченный период";
}

export function ogrnLabel(kind: "ul" | "ip"): string {
  return kind === "ip" ? "ОГРНИП" : "ОГРН";
}

export function periodLine(s: CertificateSnapshot): string {
  const start = moscowDate(s.period.start);
  const end = moscowDate(s.period.end) ?? "";
  return `${start ? `с ${start} ` : ""}по ${end}, ${periodKindLabel(s.period.kind)}`;
}

export const BUSINESS_CERTIFICATE_LICENSOR_LINE = `${BUSINESS_LEGAL_OPERATOR.name}, ИНН ${BUSINESS_LEGAL_OPERATOR.inn}, ОГРНИП ${BUSINESS_LEGAL_OPERATOR.ogrnip} – изготовитель и правообладатель фонограмм каталога`;

export function basisLine(s: CertificateSnapshot): string {
  return `Договор-оферта «АудиоЛад Кофейня», ${s.offer.label.toLowerCase()}, принята ${moscowDate(s.offer.acceptedAt) ?? ""}`;
}

/** Таблица полей сертификата (приложение 2, п. 6) – одна для печати, экрана и страницы проверки. */
export function certificateRows(input: { number: string; issuedAt: string; snapshot: CertificateSnapshot }): Array<[string, string]> {
  const s = input.snapshot;
  return [
    ["Номер", certificateDisplayNumber(input.number)],
    ["Выдан", moscowDate(input.issuedAt) ?? ""],
    ["Действует по", moscowDate(s.period.end) ?? ""],
    ["Заведение", s.venueName],
    ["Адрес заведения", s.venueAddress],
    ["Лицензиат", s.licensee.name],
    [`ИНН / ${ogrnLabel(s.licensee.kind)}`, `${s.licensee.inn} / ${s.licensee.ogrn}`],
    ["Срок доступа", periodLine(s)],
    ["Каталог", BUSINESS_CERTIFICATE_CATALOG],
    ["Создание музыки", BUSINESS_CERTIFICATE_GENERATORS],
    ["Учётная запись", `№ ${s.accountCode}`],
    ["Лицензиар", BUSINESS_CERTIFICATE_LICENSOR_LINE],
    ["Основание", basisLine(s)],
  ];
}

export type CertificateCheckStatus = "valid" | "expired" | "outdated" | "superseded" | "revoked";

/** Данные, которые должны совпадать у действующего сертификата и у точки сейчас. */
export type CertificateCurrentFacts = {
  venueName: string;
  venueAddress: string | null;
  licensee: { inn: string; ogrn: string; name: string } | null;
  licenseeInactive: boolean;
};

/** Сертификат перестаёт подтверждать право, как только адрес, название точки или лицензиат изменились. */
export function certificateSnapshotIsCurrent(snapshot: CertificateSnapshot, now: CertificateCurrentFacts): boolean {
  return (
    !now.licenseeInactive &&
    Boolean(now.licensee) &&
    snapshot.venueName === now.venueName &&
    snapshot.venueAddress === now.venueAddress &&
    snapshot.licensee.inn === now.licensee?.inn &&
    snapshot.licensee.ogrn === now.licensee?.ogrn &&
    snapshot.licensee.name === now.licensee?.name
  );
}

export function certificateStatusLabel(status: CertificateCheckStatus): string {
  switch (status) {
    case "valid":
      return "Действует";
    case "expired":
      return "Не действует: доступ к заведению закончился";
    case "outdated":
      return "Не действует: данные заведения или лицензиата изменились";
    case "superseded":
      return "Заменён новым сертификатом";
    case "revoked":
      return "Отозван";
  }
}

export const BUSINESS_CERTIFICATE_MISSING_TEXT: Record<CertificateMissing, string> = {
  inn: "Укажите ИНН организации или ИП.",
  inn_inactive: "По данным ФНС организация или ИП с этим ИНН прекратили деятельность. Укажите действующий ИНН.",
  registry: "Не удалось проверить ИНН в реестре ФНС. Откройте страницу позже.",
  revoked: "Сертификат этого заведения отозван. Напишите нам: 1@audiolad.ru.",
  address: "Укажите адрес заведения.",
  offer: "Примите новую редакцию договора-оферты.",
  access: "Сертификат выдаётся, пока идёт подарочный или оплаченный период.",
};

/**
 * Начало срока доступа в сертификате: самое позднее начало среди окон, которые идут сейчас (подарочная неделя,
 * оплаченные периоды владельца). Берём позднее, чтобы срок никогда не начинался раньше, чем доступ этой точки:
 * продление начинается после текущего периода, а оплата другой точки может покрывать то же время.
 */
export function currentAccessStart(windows: readonly { start: string; end: string }[], now: Date): string | null {
  const t = now.getTime();
  let best: { at: number; iso: string } | null = null;
  for (const w of windows) {
    const start = Date.parse(w.start);
    const end = Date.parse(w.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > t || end <= t) continue;
    if (!best || start > best.at) best = { at: start, iso: new Date(start).toISOString() };
  }
  return best?.iso ?? null;
}
