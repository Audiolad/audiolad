import {
  PRODUCT_KIND,
  normalizeProductKind,
  type ProductKind,
} from "@/lib/author-products/product-kind";

import {
  compareDailyGiftKeys,
  hashDeterministicKey,
} from "./daily-free-gifts";

export type ForYouListeningState = "unplayed" | "in_progress" | "completed";

export type DailyForYouCandidate = {
  id: string;
  authorId: string;
  productKind?: ProductKind;
  isFree: boolean;
  isInLibrary: boolean;
  isPurchased?: boolean;
  isGifted?: boolean;
  isPersonal?: boolean;
  listeningState: ForYouListeningState;
};

type SelectDailyForYouProductsInput<T extends DailyForYouCandidate> = {
  products: readonly T[];
  userId: string;
  dateKey: string;
  limit?: number;
};

type AuthorSelection<T extends DailyForYouCandidate> = {
  authorId: string;
  product: T;
};

function isEligibleCandidate(product: DailyForYouCandidate): boolean {
  if (
    !product.isFree ||
    !product.authorId.trim() ||
    product.isInLibrary ||
    product.isPurchased ||
    product.isGifted ||
    product.isPersonal ||
    product.listeningState === "completed"
  ) {
    return false;
  }

  const productKind = normalizeProductKind(product.productKind);

  return (
    productKind === PRODUCT_KIND.PRACTICE || productKind === PRODUCT_KIND.MUSIC
  );
}

function selectOneProductPerAuthor<T extends DailyForYouCandidate>({
  products,
  userId,
  dateKey,
  excludedAuthorIds,
  limit,
}: {
  products: readonly T[];
  userId: string;
  dateKey: string;
  excludedAuthorIds: ReadonlySet<string>;
  limit: number;
}): AuthorSelection<T>[] {
  const candidatesByAuthor = new Map<string, T[]>();

  for (const product of products) {
    const authorId = product.authorId.trim();

    if (!authorId || excludedAuthorIds.has(authorId)) {
      continue;
    }

    const candidates = candidatesByAuthor.get(authorId) ?? [];
    candidates.push(product);
    candidatesByAuthor.set(authorId, candidates);
  }

  return [...candidatesByAuthor.entries()]
    .flatMap(([authorId, candidates]) => {
      const [product] = [...candidates].sort((left, right) =>
        compareDailyGiftKeys(
          {
            key: hashDeterministicKey(
              `${dateKey}|for-you-product|${userId}|${authorId}|${left.id}`,
            ),
            id: left.id,
          },
          {
            key: hashDeterministicKey(
              `${dateKey}|for-you-product|${userId}|${authorId}|${right.id}`,
            ),
            id: right.id,
          },
        ),
      );

      return product ? [{ authorId, product }] : [];
    })
    .sort((left, right) =>
      compareDailyGiftKeys(
        {
          key: hashDeterministicKey(
            `${dateKey}|for-you-author|${userId}|${left.authorId}`,
          ),
          id: left.authorId,
        },
        {
          key: hashDeterministicKey(
            `${dateKey}|for-you-author|${userId}|${right.authorId}`,
          ),
          id: right.authorId,
        },
      ),
    )
    .slice(0, limit);
}

export function selectDailyForYouProducts<T extends DailyForYouCandidate>({
  products,
  userId,
  dateKey,
  limit = 6,
}: SelectDailyForYouProductsInput<T>): T[] {
  if (limit <= 0 || !userId.trim()) {
    return [];
  }

  const eligibleProducts = products.filter(isEligibleCandidate);
  const unplayed = eligibleProducts.filter(
    (product) => product.listeningState === "unplayed",
  );
  const selected = selectOneProductPerAuthor({
    products: unplayed,
    userId,
    dateKey,
    excludedAuthorIds: new Set<string>(),
    limit,
  });
  const selectedAuthorIds = new Set(selected.map((selection) => selection.authorId));

  if (selected.length < limit) {
    selected.push(
      ...selectOneProductPerAuthor({
        products: eligibleProducts.filter(
          (product) => product.listeningState === "in_progress",
        ),
        userId,
        dateKey,
        excludedAuthorIds: selectedAuthorIds,
        limit: limit - selected.length,
      }),
    );
  }

  return selected.map((selection) => selection.product);
}
