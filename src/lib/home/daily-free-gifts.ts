import {
  PRODUCT_KIND,
  normalizeProductKind,
  type ProductKind,
} from "@/lib/author-products/product-kind";

const MOSCOW_TIME_ZONE = "Europe/Moscow";

export type DailyFreeGiftCandidate = {
  id: string;
  authorId: string;
  productKind?: ProductKind;
  isFree: boolean;
};

type SelectDailyFreeGiftProductsInput<T extends DailyFreeGiftCandidate> = {
  products: readonly T[];
  featuredProductId: string | null;
  dateKey: string;
  limit?: number;
};

type DailyGiftSelection<T extends DailyFreeGiftCandidate> = {
  authorId: string;
  product: T;
};

function hashDailyGiftKey(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function compareDailyGiftKeys(
  left: { key: number; id: string },
  right: { key: number; id: string },
): number {
  return left.key - right.key || left.id.localeCompare(right.id);
}

function isEligibleDailyFreeGiftProduct(
  product: DailyFreeGiftCandidate,
  featuredProductId: string | null,
): boolean {
  if (
    !product.isFree ||
    product.id === featuredProductId ||
    !product.authorId.trim()
  ) {
    return false;
  }

  const productKind = normalizeProductKind(product.productKind);

  if (productKind === PRODUCT_KIND.MUSIC) {
    return true;
  }

  return productKind === PRODUCT_KIND.PRACTICE;
}

export function getMoscowDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function selectDailyFreeGiftProducts<T extends DailyFreeGiftCandidate>({
  products,
  featuredProductId,
  dateKey,
  limit = 8,
}: SelectDailyFreeGiftProductsInput<T>): T[] {
  if (limit <= 0) {
    return [];
  }

  const candidatesByAuthor = new Map<string, T[]>();

  for (const product of products) {
    if (!isEligibleDailyFreeGiftProduct(product, featuredProductId)) {
      continue;
    }

    const authorId = product.authorId.trim();
    const candidates = candidatesByAuthor.get(authorId) ?? [];
    candidates.push(product);
    candidatesByAuthor.set(authorId, candidates);
  }

  const selections: DailyGiftSelection<T>[] = [];

  for (const [authorId, candidates] of candidatesByAuthor) {
    const [product] = [...candidates].sort((left, right) =>
      compareDailyGiftKeys(
        {
          key: hashDailyGiftKey(`${dateKey}|product|${authorId}|${left.id}`),
          id: left.id,
        },
        {
          key: hashDailyGiftKey(`${dateKey}|product|${authorId}|${right.id}`),
          id: right.id,
        },
      ),
    );

    if (product) {
      selections.push({
        authorId,
        product,
      });
    }
  }

  return selections
    .sort((left, right) =>
      compareDailyGiftKeys(
        {
          key: hashDailyGiftKey(`${dateKey}|author|${left.authorId}`),
          id: left.authorId,
        },
        {
          key: hashDailyGiftKey(`${dateKey}|author|${right.authorId}`),
          id: right.authorId,
        },
      ),
    )
    .slice(0, limit)
    .map((selection) => selection.product);
}
