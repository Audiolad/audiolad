import {
  buildProductStartPayload,
  compactUuid,
  expandCompactUuid,
  parseProductStartPayload,
} from "@/lib/mini-app/product-target";

export const MAX_MINI_APP_BOT_NAME = "id507305817690_1_bot";
export const MAX_MINI_APP_DEEP_LINK_ORIGIN = "https://max.ru";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function buildMaxProductStartPayload(practiceId: string): string | null {
  return buildProductStartPayload(practiceId);
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

  const product = parseProductStartPayload(normalized);
  if (product) {
    return { kind: "product", practiceId: product.practiceId };
  }

  const match = normalized.match(/^g_([0-9a-f]{32})$/i);
  if (!match) return null;

  const promoPageId = expandCompactUuid(match[1] ?? "");
  if (!promoPageId) return null;
  return { kind: "promo", promoPageId };
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
