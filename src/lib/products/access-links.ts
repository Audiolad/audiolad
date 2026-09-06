import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

export const PRACTICE_ACCESS_LINK_PATH_PREFIX = "/access" as const;

export const ACCESS_LINK_TOKEN_BYTE_LENGTH = 32;
export const ACCESS_LINK_TOKEN_HASH_HEX_LENGTH = 64;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const TOKEN_HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;

export const ACCESS_LINK_EXPIRY_OPTIONS = ["none", "24h", "7d"] as const;
export type AccessLinkExpiryOption = (typeof ACCESS_LINK_EXPIRY_OPTIONS)[number];

export type PracticeAccessLinkStoredStatus = "active" | "redeemed" | "revoked";

export type PracticeAccessLinkDisplayStatus =
  | PracticeAccessLinkStoredStatus
  | "expired";

export type GeneratedPracticeAccessToken = {
  rawToken: string;
  tokenHash: string;
};

export type AccessLinkTargetValidationInput = {
  publicationClass: string | null | undefined;
  configuredLevels: ReadonlyArray<{ level: number }>;
  targetLevel: number;
};

export type AccessLinkTargetValidationResult =
  | { ok: true; targetLevel: number }
  | { ok: false; code: string };

export type PracticeAccessLinkListItem = {
  id: string;
  targetAccessLevel: number;
  status: PracticeAccessLinkDisplayStatus;
  createdAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  revokedAt: string | null;
};

export type PracticeAccessLinkAllowedTarget = {
  level: number;
  title: string | null;
  description: string | null;
};

export type PracticeAccessLinkPreview = {
  status:
    | "active"
    | "redeemed"
    | "already_redeemed_by_you"
    | "revoked"
    | "expired";
  productTitle: string;
  productSlug: string;
  authorSlug: string | null;
  publicationClass: string | null;
  targetAccessLevel: number;
  levelTitle: string | null;
  levelDescription: string | null;
  expiresAt: string | null;
  productHref: string | null;
};

export const ACCESS_LINK_SECTION_TITLE = "Доступ по ссылке";
export const ACCESS_LINK_SECTION_COPY =
  "Создайте одноразовую ссылку, если клиент оплатил продукт вне Audiolad.";
export const ACCESS_LINK_CREATE_ORDINARY_LABEL = "Создать ссылку доступа";
export const ACCESS_LINK_CREATE_COURSE_LABEL = "Создать одноразовую ссылку";
export const ACCESS_LINK_COPY_LABEL = "Копировать ссылку";
export const ACCESS_LINK_ONCE_HINT = "Ссылка действует один раз.";
export const ACCESS_LINK_LOST_HINT =
  "Если ссылка потеряна, создайте новую и при необходимости отзовите старую.";

export function isValidPracticeAccessTokenFormat(rawToken: string): boolean {
  const normalized = rawToken.trim();

  if (!normalized || normalized.length < 40 || normalized.length > 64) {
    return false;
  }

  return BASE64URL_PATTERN.test(normalized);
}

export function isValidPracticeAccessTokenHash(tokenHash: string): boolean {
  return TOKEN_HASH_HEX_PATTERN.test(tokenHash);
}

export function buildAccessLinkPath(rawToken: string): string {
  return `${PRACTICE_ACCESS_LINK_PATH_PREFIX}/${rawToken.trim()}`;
}

export function buildAccessLinkUrl(
  rawToken: string,
  origin: string = PRODUCTION_APP_ORIGIN,
): string {
  return `${origin.replace(/\/$/, "")}${buildAccessLinkPath(rawToken)}`;
}

export function isAccessLinkPath(pathname: string | null | undefined): boolean {
  const trimmed = (pathname ?? "").trim();
  return (
    trimmed === PRACTICE_ACCESS_LINK_PATH_PREFIX ||
    trimmed.startsWith(`${PRACTICE_ACCESS_LINK_PATH_PREFIX}/`)
  );
}

export function resolveAccessLinkExpiry(
  option: AccessLinkExpiryOption,
  now: Date = new Date(),
): Date | null {
  if (option === "none") {
    return null;
  }

  const expires = new Date(now.getTime());

  if (option === "24h") {
    expires.setUTCHours(expires.getUTCHours() + 24);
    return expires;
  }

  expires.setUTCDate(expires.getUTCDate() + 7);
  return expires;
}

export function parseAccessLinkExpiryOption(
  value: unknown,
): AccessLinkExpiryOption | null {
  if (value === "none" || value === "24h" || value === "7d") {
    return value;
  }

  return null;
}

export const ACCESS_LINK_CREATE_TARGET_KEYS = [
  "targetAccessLevel",
  "target_access_level",
] as const;

export const ACCESS_LINK_CREATE_EXPIRY_KEYS = ["expiresIn", "expiry"] as const;

export type AccessLinkCreateFieldPick =
  | { present: false }
  | { present: true; key: string; value: unknown };

export function pickFirstPresentCreateField(
  record: Record<string, unknown>,
  keys: readonly string[],
): AccessLinkCreateFieldPick {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return { present: true, key, value: record[key] };
    }
  }

  return { present: false };
}

export function resolveAccessLinkCreateTargetLevel(
  record: Record<string, unknown>,
):
  | { ok: true; targetLevel: number }
  | { ok: false; code: "invalid_access_level" } {
  const picked = pickFirstPresentCreateField(
    record,
    ACCESS_LINK_CREATE_TARGET_KEYS,
  );

  if (!picked.present) {
    return { ok: true, targetLevel: 1 };
  }

  const parsed = parseAccessLinkTargetLevel(picked.value);

  if (parsed === null) {
    return { ok: false, code: "invalid_access_level" };
  }

  return { ok: true, targetLevel: parsed };
}

export function parseAccessLinkCreateRequestBody(
  value: unknown,
):
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; code: "invalid_access_link_request" } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "invalid_access_link_request" };
  }

  return { ok: true, body: value as Record<string, unknown> };
}

export function resolveAccessLinkCreateExpiry(
  record: Record<string, unknown>,
):
  | { ok: true; expiry: AccessLinkExpiryOption }
  | { ok: false; code: "invalid_access_link_expiry" } {
  const picked = pickFirstPresentCreateField(
    record,
    ACCESS_LINK_CREATE_EXPIRY_KEYS,
  );

  if (!picked.present) {
    return { ok: true, expiry: "none" };
  }

  const parsed = parseAccessLinkExpiryOption(picked.value);

  if (parsed === null) {
    return { ok: false, code: "invalid_access_link_expiry" };
  }

  return { ok: true, expiry: parsed };
}

export function redactAccessTokenFromPath(pathname: string): string {
  return pathname
    .replace(/^(\/access\/)[^/?#]+/i, "$1[redacted]")
    .replace(/^(\/api\/access\/)[^/?#]+/i, "$1[redacted]");
}

export function redactAccessTokenFromHref(href: string): string {
  const raw = href.trim();

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      url.pathname = redactAccessTokenFromPath(url.pathname);
      const next = url.searchParams.get("next");
      if (next) {
        url.searchParams.set("next", redactAccessTokenFromPath(next));
      }
      return `${url.origin}${url.pathname}${url.search}`;
    }
  } catch {
    // Fall through to path-only redaction.
  }

  const [path, query] = raw.split("?");
  const redactedPath = redactAccessTokenFromPath(path ?? "");

  if (!query) {
    return redactedPath;
  }

  const params = new URLSearchParams(query);
  const next = params.get("next");
  if (next) {
    params.set("next", redactAccessTokenFromPath(next));
  }

  const nextQuery = params.toString();
  return nextQuery ? `${redactedPath}?${nextQuery}` : redactedPath;
}

export function isAccessTokenAnalyticsRoute(
  pathname: string | null | undefined,
): boolean {
  const normalized = (pathname ?? "").trim();

  return (
    normalized === "/access" ||
    normalized.startsWith("/access/") ||
    normalized === "/api/access" ||
    normalized.startsWith("/api/access/")
  );
}

export function parseAccessLinkTargetLevel(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 1) {
      return parsed;
    }
  }

  return null;
}

export function validateAccessLinkTargetLevel(
  input: AccessLinkTargetValidationInput,
): AccessLinkTargetValidationResult {
  const targetLevel = input.targetLevel;

  if (!Number.isInteger(targetLevel) || targetLevel < 1) {
    return { ok: false, code: "invalid_access_level" };
  }

  const isCourse = input.publicationClass === "course";
  const configured = input.configuredLevels
    .map((item) => item.level)
    .filter((level) => Number.isInteger(level) && level >= 1);

  if (!isCourse) {
    if (targetLevel !== 1) {
      return { ok: false, code: "access_level_not_available" };
    }
    return { ok: true, targetLevel: 1 };
  }

  if (configured.length === 0) {
    if (targetLevel !== 1) {
      return { ok: false, code: "target_level_not_configured" };
    }
    return { ok: true, targetLevel: 1 };
  }

  if (!configured.includes(targetLevel)) {
    return { ok: false, code: "target_level_not_configured" };
  }

  return { ok: true, targetLevel };
}

export function deriveAccessLinkDisplayStatus(input: {
  status: string;
  expiresAt: string | null | undefined;
  now?: Date;
}): PracticeAccessLinkDisplayStatus {
  if (input.status === "redeemed" || input.status === "revoked") {
    return input.status;
  }

  if (input.expiresAt) {
    const expires = new Date(input.expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires <= (input.now ?? new Date())) {
      return "expired";
    }
  }

  return "active";
}

export function buildProductHrefFromPreview(preview: {
  authorSlug: string | null;
  productSlug: string;
}): string | null {
  const authorSlug = preview.authorSlug?.trim() ?? "";
  const productSlug = preview.productSlug.trim();

  if (!authorSlug || !productSlug) {
    return null;
  }

  return `/practice/${authorSlug}/${productSlug}`;
}

export function mapAccessLinkListItem(row: {
  id: string;
  target_access_level: number;
  status: string;
  created_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  revoked_at: string | null;
}): PracticeAccessLinkListItem {
  return {
    id: row.id,
    targetAccessLevel: row.target_access_level,
    status: deriveAccessLinkDisplayStatus({
      status: row.status,
      expiresAt: row.expires_at,
    }),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at,
    revokedAt: row.revoked_at,
  };
}

export function accessLinkPublicErrorMessage(code: string | undefined): string {
  switch (code) {
    case "already_redeemed_by_you":
      return "Доступ уже открыт.";
    case "link_already_used":
    case "redeemed":
      return "Эта ссылка уже использована.";
    case "link_expired":
    case "expired":
      return "Срок действия ссылки истёк.";
    case "link_revoked":
    case "revoked":
      return "Эта ссылка отозвана.";
    case "target_level_not_configured":
      return "Этот уровень доступа больше недоступен.";
    case "unauthorized":
      return "Войдите, чтобы открыть доступ.";
    case "invalid_token":
    default:
      return "Ссылка недействительна.";
  }
}

export function accessLinkAuthorErrorMessage(code: string | undefined): string {
  switch (code) {
    case "access_level_not_available":
      return "Повышенный уровень доступа доступен только для аудиокурсов.";
    case "target_level_not_configured":
      return "Выберите один из настроенных уровней доступа.";
    case "invalid_access_level":
      return "Укажите уровень доступа целым числом от 1.";
    case "invalid_access_link_expiry":
      return "Укажите срок действия ссылки: без срока, 24 часа или 7 дней.";
    case "invalid_access_link_request":
      return "Отправьте JSON-объект с параметрами ссылки.";
    case "link_not_active":
      return "Отозвать можно только активную ссылку.";
    case "forbidden":
      return "Недостаточно прав для этой операции.";
    default:
      return "Не удалось выполнить действие со ссылкой доступа.";
  }
}
