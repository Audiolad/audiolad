/**
 * Centralized acquisition source_class (mirrors SQL classify_acquisition_source_class).
 * Session-touch / first-touch classification — not money attribution.
 */

export type AcquisitionSourceClass =
  | "utm"
  | "organic_search"
  | "social"
  | "messenger"
  | "referral"
  | "direct_or_unknown"
  | "internal"
  | "unknown";

const INTERNAL_REFERRERS = new Set([
  "audiolad.ru",
  "www.audiolad.ru",
  "localhost",
  "127.0.0.1",
]);

function sanitizeUtmValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 128);

  return cleaned || null;
}

/**
 * UI label for empty / unclassified acquisition (not a stored source_class).
 */
export function acquisitionSourceLabel(
  sourceClass: AcquisitionSourceClass | null | undefined,
): string {
  switch (sourceClass) {
    case "utm":
      return "UTM-кампания";
    case "organic_search":
      return "Органический поиск";
    case "social":
      return "Социальные сети";
    case "messenger":
      return "Мессенджеры";
    case "referral":
      return "Переход с другого сайта";
    case "direct_or_unknown":
      return "Без UTM / источник не определён";
    case "internal":
      return "Внутренний переход";
    case "unknown":
      return "Нет данных";
    default:
      return "Нет данных";
  }
}

export function classifyAcquisitionSourceClass(input: {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrerDomain?: string | null;
}): AcquisitionSourceClass {
  const src = (sanitizeUtmValue(input.utmSource) ?? "").toLowerCase();
  const med = (sanitizeUtmValue(input.utmMedium) ?? "").toLowerCase();
  const camp = (sanitizeUtmValue(input.utmCampaign) ?? "").toLowerCase();
  let ref = (sanitizeUtmValue(input.referrerDomain) ?? "").toLowerCase();

  if (INTERNAL_REFERRERS.has(ref)) {
    ref = "";
  }

  if (src || med || camp) {
    if (
      ["telegram", "tg", "max", "vk", "whatsapp", "viber"].includes(src) ||
      ["messenger", "messaging", "messaging_bot", "social_messenger"].includes(med) ||
      src.startsWith("bothelp") ||
      med.includes("messenger")
    ) {
      return "messenger";
    }

    if (
      ["social", "social-network", "social_media"].includes(med) ||
      ["facebook", "instagram", "youtube", "tiktok", "ok", "odnoklassniki"].includes(
        src,
      )
    ) {
      return "social";
    }

    return "utm";
  }

  if (!ref) {
    return "direct_or_unknown";
  }

  if (
    ref.includes("google.") ||
    ref.includes("yandex.") ||
    ref.includes("bing.") ||
    ref.includes("duckduckgo.") ||
    ref === "go.mail.ru" ||
    ref.includes("search.yahoo.")
  ) {
    return "organic_search";
  }

  if (
    ref.includes("t.me") ||
    ref.includes("telegram.") ||
    ref.includes("max.ru") ||
    ref.includes("oneme.ru") ||
    ref.includes("whatsapp.") ||
    ref.includes("wa.me")
  ) {
    return "messenger";
  }

  if (
    ref.includes("vk.com") ||
    ref.includes("vk.ru") ||
    ref.includes("facebook.") ||
    ref.includes("instagram.") ||
    ref.includes("youtube.") ||
    ref.includes("tiktok.") ||
    ref.includes("ok.ru")
  ) {
    return "social";
  }

  return "referral";
}
