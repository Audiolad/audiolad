import { sanitizeCheckoutOriginPath } from "@/lib/analytics/checkout-origin";
import {
  normalizePurchaseSurface,
  type PurchaseSurface,
} from "@/lib/analytics/purchase-surface";

export const BUY_CLICKED_EVENT = "buy_clicked" as const;

/** Max age of a buy click for exact order linkage (seconds). */
export const BUY_CLICK_FRESHNESS_SECONDS = 15 * 60;

export const BUY_CLICKED_PROPERTY_KEYS = [
  "author_id",
  "product_price_minor_snapshot",
  "currency",
  "path",
  "purchase_surface",
  "client_event_id",
] as const;

export type BuyClickedProperties = {
  author_id?: string | null;
  product_price_minor_snapshot?: number | null;
  currency?: string | null;
  path?: string | null;
  purchase_surface: PurchaseSurface;
  client_event_id?: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Build allowlisted buy_clicked properties.
 * Does not include email, payment/order tokens, or nested JSON.
 */
export function buildBuyClickedProperties(input: {
  authorId?: string | null;
  productPriceMinorSnapshot?: number | null;
  currency?: string | null;
  path?: string | null;
  purchaseSurface?: string | null;
  clientEventId?: string | null;
}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {
    purchase_surface: normalizePurchaseSurface(input.purchaseSurface),
    currency:
      typeof input.currency === "string" && input.currency.trim()
        ? input.currency.trim().slice(0, 8).toUpperCase()
        : "RUB",
  };

  const path = sanitizeCheckoutOriginPath(input.path);
  if (path) {
    out.path = path;
  }

  if (
    typeof input.authorId === "string" &&
    UUID_PATTERN.test(input.authorId.trim())
  ) {
    out.author_id = input.authorId.trim().toLowerCase();
  }

  if (
    typeof input.productPriceMinorSnapshot === "number" &&
    Number.isFinite(input.productPriceMinorSnapshot) &&
    input.productPriceMinorSnapshot >= 0
  ) {
    out.product_price_minor_snapshot = Math.floor(
      input.productPriceMinorSnapshot,
    );
  }

  if (
    typeof input.clientEventId === "string" &&
    UUID_PATTERN.test(input.clientEventId.trim())
  ) {
    out.client_event_id = input.clientEventId.trim().toLowerCase();
  }

  return out;
}

/** Keep only allowlisted buy_clicked keys from arbitrary properties. */
export function filterBuyClickedProperties(
  properties: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const allow = new Set<string>(BUY_CLICKED_PROPERTY_KEYS);
  const next: Record<string, string | number | boolean> = {};

  for (const key of BUY_CLICKED_PROPERTY_KEYS) {
    if (!(key in properties) || !allow.has(key)) {
      continue;
    }
    next[key] = properties[key]!;
  }

  if (typeof next.purchase_surface === "string") {
    next.purchase_surface = normalizePurchaseSurface(next.purchase_surface);
  } else {
    next.purchase_surface = "unknown";
  }

  if (typeof next.path === "string") {
    const path = sanitizeCheckoutOriginPath(next.path);
    if (path) {
      next.path = path;
    } else {
      delete next.path;
    }
  }

  return next;
}
