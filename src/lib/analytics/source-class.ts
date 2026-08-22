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
  | "unknown"
  | "ai";

const INTERNAL_REFERRERS = new Set([
  "audiolad.ru",
  "www.audiolad.ru",
  "localhost",
  "127.0.0.1",
]);

/**
 * Hosts that are independently AI products. Do not list google.com, bing.com, or yandex.ru.
 */
export const AI_REFERRER_ROOTS = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "copilot.microsoft.com",
  "gemini.google.com",
  "bard.google.com",
  "alice.yandex.ru",
  "alice.yandex.com",
] as const;

/** Explicit UTM sources only — never infer from "google" / "bing" / "yandex". */
export const AI_UTM_SOURCES = new Set([
  "chatgpt",
  "chatgpt.com",
  "chat-gpt",
  "perplexity",
  "perplexity.ai",
  "copilot",
  "microsoft-copilot",
  "gemini",
  "google-gemini",
  "bard",
  "alice",
  "alisa",
  "yandex-alice",
  "yandex-alisa",
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

function normalizeReferrerHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

export function isReliableAiReferrerHost(referrerDomain: string | null | undefined): boolean {
  const host = normalizeReferrerHost(referrerDomain ?? "");

  if (!host) {
    return false;
  }

  return AI_REFERRER_ROOTS.some((root) => host === root || host.endsWith(`.${root}`));
}

export function isReliableAiUtmSource(utmSource: string | null | undefined): boolean {
  const src = (sanitizeUtmValue(utmSource) ?? "").toLowerCase();
  return AI_UTM_SOURCES.has(src);
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
    case "ai":
      return "AI-сервисы";
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
    if (isReliableAiUtmSource(src)) {
      return "ai";
    }

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

  if (isReliableAiReferrerHost(ref)) {
    return "ai";
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
