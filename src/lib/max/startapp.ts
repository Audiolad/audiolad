export const MAX_MINI_APP_BOT_NAME = "id507305817690_bot";
export const MAX_MINI_APP_DEEP_LINK_ORIGIN = "https://max.ru";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPACT_UUID_RE = /^[0-9a-f]{32}$/i;

export type MaxStartTarget =
  | {
      kind: "product";
      practiceId: string;
    }
  | {
      kind: "promo";
      promoPageId: string;
    };

export type MaxResolvedStartTarget =
  | {
      kind: "product";
      practiceId: string;
      authorSlug: string;
      productSlug: string;
    }
  | {
      kind: "promo";
      promoPageId: string;
      authorSlug: string;
      promoSlug: string;
    };

function compactUuid(uuid: string): string | null {
  const normalized = uuid.trim().toLowerCase();
  if (!UUID_RE.test(normalized)) return null;
  return normalized.replaceAll("-", "");
}

function expandUuid(compact: string): string | null {
  const normalized = compact.trim().toLowerCase();
  if (!COMPACT_UUID_RE.test(normalized)) return null;
  const uuid = [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20),
  ].join("-");
  return UUID_RE.test(uuid) ? uuid : null;
}

export function buildMaxProductStartPayload(practiceId: string): string | null {
  const compact = compactUuid(practiceId);
  return compact ? `p_${compact}` : null;
}

export function buildMaxPromoStartPayload(promoPageId: string): string | null {
  const compact = compactUuid(promoPageId);
  return compact ? `g_${compact}` : null;
}

export function parseMaxStartPayload(
  payload: string | null | undefined,
): MaxStartTarget | null {
  const normalized = payload?.trim();
  if (!normalized || normalized.length > 512) return null;

  const match = normalized.match(/^([pg])_([0-9a-f]{32})$/i);
  if (!match) return null;

  const id = expandUuid(match[2] ?? "");
  if (!id) return null;

  return match[1]?.toLowerCase() === "p"
    ? { kind: "product", practiceId: id }
    : { kind: "promo", promoPageId: id };
}

export function buildMaxMiniAppDeepLink(payload: string): string | null {
  const normalized = payload.trim();
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(normalized)) return null;

  const url = new URL(`/${MAX_MINI_APP_BOT_NAME}`, MAX_MINI_APP_DEEP_LINK_ORIGIN);
  url.searchParams.set("startapp", normalized);
  return url.toString();
}

export function buildMaxProductDeepLink(practiceId: string): string | null {
  const payload = buildMaxProductStartPayload(practiceId);
  return payload ? buildMaxMiniAppDeepLink(payload) : null;
}

export function buildMaxPromoDeepLink(promoPageId: string): string | null {
  const payload = buildMaxPromoStartPayload(promoPageId);
  return payload ? buildMaxMiniAppDeepLink(payload) : null;
}

export function readMaxResolvedStartTarget(value: unknown): MaxResolvedStartTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  if (
    row.kind === "product" &&
    typeof row.practiceId === "string" &&
    typeof row.authorSlug === "string" &&
    typeof row.productSlug === "string" &&
    UUID_RE.test(row.practiceId) &&
    row.authorSlug.trim() &&
    row.productSlug.trim()
  ) {
    return {
      kind: "product",
      practiceId: row.practiceId,
      authorSlug: row.authorSlug.trim(),
      productSlug: row.productSlug.trim(),
    };
  }

  if (
    row.kind === "promo" &&
    typeof row.promoPageId === "string" &&
    typeof row.authorSlug === "string" &&
    typeof row.promoSlug === "string" &&
    UUID_RE.test(row.promoPageId) &&
    row.authorSlug.trim() &&
    row.promoSlug.trim()
  ) {
    return {
      kind: "promo",
      promoPageId: row.promoPageId,
      authorSlug: row.authorSlug.trim(),
      promoSlug: row.promoSlug.trim(),
    };
  }

  return null;
}
