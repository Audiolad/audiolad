import type { YandexMetrikaGoalName } from "@/lib/analytics/yandex-metrika-goals";

export type YandexMetrikaGoalParams = {
  source?: string | null;
  platform?: string | null;
  browser_environment?: string | null;
  install_mode?: string | null;
  result?: string | null;
};

const ALLOWED_SOURCES = new Set([
  "retention",
  "banner",
  "menu",
  "profile",
  "other",
]);

const ALLOWED_PLATFORMS = new Set(["ios", "android", "desktop", "unknown"]);

const ALLOWED_BROWSER_ENVIRONMENTS = new Set([
  "safari",
  "chrome",
  "edge",
  "firefox",
  "in_app",
  "standalone",
  "unknown",
]);

const ALLOWED_INSTALL_MODES = new Set([
  "native_prompt",
  "ios_manual",
  "android_manual",
  "desktop_manual",
  "in_app_redirect",
  "unknown",
]);

const ALLOWED_RESULTS = new Set([
  "shown",
  "accepted",
  "dismissed",
  "installed",
  "closed",
  "unknown",
]);

const PII_PARAM_KEYS = new Set([
  "email",
  "password",
  "name",
  "first_name",
  "last_name",
  "phone",
  "user_id",
  "userid",
  "uuid",
  "profile_id",
  "anonymous_id",
  "anonymous_session_id",
  "session_id",
  "access_token",
  "token",
  "session_token",
  "practice_id",
  "practice_slug",
  "product_slug",
  "audio_url",
  "signed_url",
  "user_agent",
  "raw_user_agent",
]);

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeScalar(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value).trim().slice(0, 64);

  if (!normalized) {
    return null;
  }

  if (EMAIL_PATTERN.test(normalized)) {
    return null;
  }

  if (UUID_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function pickAllowed(
  value: unknown,
  allowed: Set<string>,
): string | null {
  const normalized = normalizeScalar(value);

  if (!normalized || !allowed.has(normalized)) {
    return null;
  }

  return normalized;
}

export function mapPwaPlatformToMetrika(
  platform: string | null | undefined,
): string | null {
  switch (platform) {
    case "ios":
      return "ios";
    case "android":
      return "android";
    case "desktop_chromium":
    case "desktop_other":
      return "desktop";
    case "unknown":
      return "unknown";
    default:
      return null;
  }
}

export function mapPwaSourceToMetrika(
  source: string | null | undefined,
): string | null {
  switch (source) {
    case "retention":
      return "retention";
    case "banner":
      return "banner";
    case "menu":
      return "menu";
    default:
      return null;
  }
}

export function inferRetentionMetrikaSource(
  goalName: YandexMetrikaGoalName,
): string | null {
  if (goalName.startsWith("first_save_retention_")) {
    return "retention";
  }

  return null;
}

export function sanitizeYandexMetrikaGoalParams(
  input: Record<string, unknown> | YandexMetrikaGoalParams | null | undefined,
): Record<string, string> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const next: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(input)) {
    const normalizedKey = key.trim().toLowerCase();

    if (!normalizedKey || PII_PARAM_KEYS.has(normalizedKey)) {
      continue;
    }

    let allowedValue: string | null = null;

    switch (normalizedKey) {
      case "source":
        allowedValue = pickAllowed(rawValue, ALLOWED_SOURCES);
        break;
      case "platform":
        allowedValue = pickAllowed(rawValue, ALLOWED_PLATFORMS);
        break;
      case "browser_environment":
        allowedValue = pickAllowed(rawValue, ALLOWED_BROWSER_ENVIRONMENTS);
        break;
      case "install_mode":
        allowedValue = pickAllowed(rawValue, ALLOWED_INSTALL_MODES);
        break;
      case "result":
        allowedValue = pickAllowed(rawValue, ALLOWED_RESULTS);
        break;
      default:
        allowedValue = null;
    }

    if (allowedValue) {
      next[normalizedKey] = allowedValue;
    }
  }

  return next;
}

export function buildPwaYandexMetrikaParams(input?: {
  platform?: string | null;
  source?: string | null;
  isStandalone?: boolean;
}): Record<string, string> {
  const params: Record<string, string> = {};

  const platform = mapPwaPlatformToMetrika(input?.platform);

  if (platform) {
    params.platform = platform;
  }

  const source = mapPwaSourceToMetrika(input?.source);

  if (source) {
    params.source = source;
  }

  if (input?.isStandalone) {
    params.browser_environment = "standalone";
  }

  return sanitizeYandexMetrikaGoalParams(params);
}
