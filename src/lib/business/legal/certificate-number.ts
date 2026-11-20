/**
 * Номер сертификата (t1633u / t1634u).
 *
 * Внутренний и URL-безопасный вид: AL-483271.
 * На печати и на экране: «АудиоЛад № 483 271» (группы по три, обычный пробел).
 * Номер – случайное уникальное 6-значное значение, общее для всех отраслей;
 * по нему нельзя оценить, сколько заведений уже пользуется сервисом.
 *
 * Старые номера ALK-2026-000002 (и кириллица АЛК-…) остаются в адресе и QR:
 * страница проверки принимает их как синоним (alias). Существующие ряды
 * не перенумеровываются в схеме; отдельная миграция с переназначением
 * на случайный номер – только с подтверждением Сергея.
 */

export const BUSINESS_CERTIFICATE_SITE = "https://audiolad.ru";

/** Образец на публичной странице (данные вымышлены). Зарезервирован в БД. */
export const BUSINESS_CERTIFICATE_SAMPLE_SERIAL = "483271";
export const BUSINESS_CERTIFICATE_SAMPLE_CANONICAL = `AL-${BUSINESS_CERTIFICATE_SAMPLE_SERIAL}`;
/** Старый адрес и QR образца, которые должны продолжать открываться. */
export const BUSINESS_CERTIFICATE_SAMPLE_LEGACY = "ALK-2026-000001";

const LEGACY_RE = /^ALK-(\d{4})-(\d{6})$/;
const CANONICAL_RE = /^AL-(\d{6})$/;
const SERIAL_RE = /^(\d{6})$/;
const DISPLAY_RE = /^АУДИОЛАД\s*№\s*(\d{3})\s*(\d{3})$/u;

export type ParsedCertificateNumber = {
  /** Нормализованный ввод: ALK-2026-000002 или AL-483271. */
  exact: string;
  serial: string;
  legacy: boolean;
};

function stripPrefix(value: string): string {
  return value.replace(/^АЛК/u, "ALK").replace(/^ALK(?=-)/, "ALK");
}

export function parseCertificateNumber(raw: string): ParsedCertificateNumber | null {
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  value = value.trim().replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ");
  const displayed = value.toUpperCase();
  const displayMatch = DISPLAY_RE.exec(displayed);
  if (displayMatch) {
    const serial = displayMatch[1] + displayMatch[2];
    return { exact: `AL-${serial}`, serial, legacy: false };
  }
  value = stripPrefix(value.toUpperCase());
  const legacy = LEGACY_RE.exec(value);
  if (legacy) return { exact: value, serial: legacy[2], legacy: true };
  const canonical = CANONICAL_RE.exec(value);
  if (canonical) return { exact: value, serial: canonical[1], legacy: false };
  const serialOnly = SERIAL_RE.exec(value.replace(/\s+/g, ""));
  if (serialOnly) return { exact: `AL-${serialOnly[1]}`, serial: serialOnly[1], legacy: false };
  return null;
}

/** ALK-2026-000001 / alk-… / АЛК-… / AL-483271 / «АудиоЛад № 483 271» → точный ключ; иначе null. */
export function normalizeBusinessLegalCertificateNumber(raw: string): string | null {
  return parseCertificateNumber(raw)?.exact ?? null;
}

export function certificateSerial(number: string): string | null {
  return parseCertificateNumber(number)?.serial ?? null;
}

export function certificateCanonicalNumber(number: string): string | null {
  const parsed = parseCertificateNumber(number);
  return parsed ? `AL-${parsed.serial}` : null;
}

/** Слаг в адресе и QR: старый ALK-… оставляем как есть, новый – AL-483271. */
export function certificateUrlSlug(number: string): string {
  return parseCertificateNumber(number)?.exact ?? number;
}

/** ALK-2026-000002 или AL-483271 → «АудиоЛад № 483 271». */
export function certificateDisplayNumber(number: string): string {
  const serial = certificateSerial(number);
  if (!serial) return number;
  return `АудиоЛад № ${serial.slice(0, 3)} ${serial.slice(3)}`;
}

export function certificateCheckUrl(number: string): string {
  return `${BUSINESS_CERTIFICATE_SITE}/b/coffee/legal/sertifikat/${certificateUrlSlug(number)}`;
}

const SAMPLE_EXACT = new Set([
  BUSINESS_CERTIFICATE_SAMPLE_LEGACY,
  BUSINESS_CERTIFICATE_SAMPLE_CANONICAL,
]);

export function isSampleCertificateNumber(raw: string): boolean {
  const parsed = parseCertificateNumber(raw);
  if (!parsed) return false;
  return SAMPLE_EXACT.has(parsed.exact) || parsed.serial === BUSINESS_CERTIFICATE_SAMPLE_SERIAL;
}
