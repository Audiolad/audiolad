/**
 * In-memory Product SEO Autofill quota guards. Process-local only.
 *
 * User limit: 5 full generations / 15 minutes. A repair inside the same
 * generation does not consume a second user slot.
 *
 * Process outbound limit: max 20 actual AI HTTP attempts / 60 minutes.
 * Separate from Wordstat rate-limit keys and stores.
 */

export const PRODUCT_SEO_AI_USER_LIMIT = 5;
export const PRODUCT_SEO_AI_USER_WINDOW_MS = 15 * 60 * 1000;
export const PRODUCT_SEO_AI_PROCESS_OUTBOUND_LIMIT = 20;
export const PRODUCT_SEO_AI_PROCESS_OUTBOUND_WINDOW_MS = 60 * 60 * 1000;
export const PRODUCT_SEO_AI_PROCESS_OUTBOUND_KEY = "product-seo-ai:outbound";

type RateEntry = { count: number; resetAt: number };

export type ProductSeoAiRateLimitStore = {
  consume(key: string, limit: number, windowMs: number): boolean;
  clear(): void;
};

export function createProductSeoAiRateLimitStore(
  options: { now?: () => number } = {},
): ProductSeoAiRateLimitStore {
  const store = new Map<string, RateEntry>();
  const now = options.now ?? Date.now;

  return {
    consume(key, limit, windowMs) {
      const current = now();
      const entry = store.get(key);

      if (!entry || current >= entry.resetAt) {
        store.set(key, { count: 1, resetAt: current + windowMs });
        return true;
      }

      if (entry.count >= limit) {
        return false;
      }

      entry.count += 1;
      return true;
    },
    clear() {
      store.clear();
    },
  };
}

const processRateLimit = createProductSeoAiRateLimitStore();

export function getProcessProductSeoAiRateLimit(): ProductSeoAiRateLimitStore {
  return processRateLimit;
}

export function consumeProductSeoAiUserRateLimit(
  userId: string,
  store: ProductSeoAiRateLimitStore = processRateLimit,
): boolean {
  return store.consume(
    `product-seo-ai:user:${userId}`,
    PRODUCT_SEO_AI_USER_LIMIT,
    PRODUCT_SEO_AI_USER_WINDOW_MS,
  );
}

export function consumeProductSeoAiOutboundSlot(
  store: ProductSeoAiRateLimitStore = processRateLimit,
): boolean {
  return store.consume(
    PRODUCT_SEO_AI_PROCESS_OUTBOUND_KEY,
    PRODUCT_SEO_AI_PROCESS_OUTBOUND_LIMIT,
    PRODUCT_SEO_AI_PROCESS_OUTBOUND_WINDOW_MS,
  );
}
