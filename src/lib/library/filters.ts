import { isProductFree } from "@/lib/products/price-format";

export type LibraryFilterId =
  | "all"
  | "purchased"
  | "gifts"
  | "saved"
  | "downloaded"
  | "uploads";

export type LibraryFilterPractice = {
  isFree: boolean | null;
  price: number | null;
};

export type LibraryFilterItem = {
  accessSource: string | null;
  isSaved?: boolean;
  canListen?: boolean;
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
  if (!item.accessSource) {
    return false;
  }

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
    case "saved":
      return item.isSaved === true;
    case "downloaded":
      return false;
    case "uploads":
      // Catalog entitlement rows never match; uploads render from a separate source.
      return false;
    default:
      return true;
  }
}

const LIBRARY_FILTER_IDS: readonly LibraryFilterId[] = [
  "all",
  "purchased",
  "gifts",
  "saved",
  "downloaded",
  "uploads",
];

export function isLibraryFilterId(
  value: string | null | undefined,
): value is LibraryFilterId {
  return (
    typeof value === "string" &&
    (LIBRARY_FILTER_IDS as readonly string[]).includes(value)
  );
}

export function getLibraryFilterEmptyMessage(filter: LibraryFilterId): string {
  switch (filter) {
    case "purchased":
      return "Здесь появятся купленные материалы.";
    case "gifts":
      return "Здесь появятся подарочные материалы из вашей Аудиотеки.";
    case "saved":
      return "Здесь появятся сохранённые материалы.";
    case "downloaded":
      return "Скачанных материалов пока нет. Когда офлайн-доступ появится, они будут здесь.";
    case "uploads":
      return "Добавьте свой аудиофайл – он будет доступен только в вашем аккаунте.";
    default:
      return "В этой подборке пока нет материалов.";
  }
}
