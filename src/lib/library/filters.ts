import { isProductFree } from "@/lib/products/price-format";

export type LibraryFilterId =
  | "all"
  | "purchased"
  | "gifts"
  | "downloaded";

export type LibraryFilterPractice = {
  isFree: boolean | null;
  price: number | null;
};

export type LibraryFilterItem = {
  accessSource: string;
  practice: LibraryFilterPractice | null;
};

const GIFT_ACCESS_SOURCES = new Set([
  "starter",
  "free_claim",
  "gift",
  "admin",
  "subscription",
  "program",
]);

export function isLibraryGiftItem(item: LibraryFilterItem): boolean {
  if (item.accessSource === "purchase") {
    return false;
  }

  const practice = item.practice;

  if (practice && isProductFree(practice.isFree, practice.price)) {
    return true;
  }

  return GIFT_ACCESS_SOURCES.has(item.accessSource);
}

export function isLibraryPurchasedItem(item: LibraryFilterItem): boolean {
  return item.accessSource === "purchase";
}

export function matchesLibraryFilter(
  item: LibraryFilterItem,
  filter: LibraryFilterId,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "purchased":
      return isLibraryPurchasedItem(item);
    case "gifts":
      return isLibraryGiftItem(item);
    case "downloaded":
      return false;
    default:
      return true;
  }
}

export function getLibraryFilterEmptyMessage(filter: LibraryFilterId): string {
  switch (filter) {
    case "purchased":
      return "Здесь появятся купленные материалы.";
    case "gifts":
      return "Здесь появятся подарочные материалы из вашей Аудиотеки.";
    case "downloaded":
      return "Скачанных материалов пока нет. Когда офлайн-доступ появится, они будут здесь.";
    default:
      return "В этой подборке пока нет материалов.";
  }
}
