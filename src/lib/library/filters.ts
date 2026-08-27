import { isProductFree } from "@/lib/products/price-format";

export type LibraryFilterId =
  | "all"
  | "purchased"
  | "gifts"
  | "saved"
  | "downloaded"
  | "uploads"
  | "playlists"
  | "personal";

export type LibraryCollectionFilterId = Exclude<LibraryFilterId, "downloaded">;

export const LIBRARY_COLLECTION_FILTERS: readonly {
  id: LibraryCollectionFilterId;
  label: string;
}[] = [
  { id: "all", label: "Все" },
  { id: "saved", label: "Сохранённые" },
  { id: "purchased", label: "Купленные" },
  { id: "gifts", label: "Подарки" },
  { id: "playlists", label: "Плейлисты" },
  { id: "uploads", label: "Моё аудио" },
  { id: "personal", label: "Личное" },
];

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
    case "playlists":
    case "personal":
      // Catalog entitlement rows never match; these collections use kinds.
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
  "playlists",
  "personal",
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
      return "Подарки появятся здесь, когда вы сохраните или откроете бесплатное.";
    case "saved":
      return "Листайте каталог и нажимайте сердце — здесь соберётся ваше.";
    case "downloaded":
      return "Скачанных материалов пока нет. Когда офлайн-доступ появится, они будут здесь.";
    case "uploads":
      return "Добавьте свой аудиофайл – он будет доступен только в вашем аккаунте.";
    case "playlists":
      return "Здесь появятся плейлисты, которые вы сохраните.";
    case "personal":
      return "Личные материалы появятся здесь, когда автор отправит их вам.";
    default:
      return "В Аудиотеке пока пусто. Начните с каталога или добавьте своё аудио.";
  }
}

export function getLibraryFilterEmptyCta(filter: LibraryFilterId): {
  href: string;
  label: string;
} | null {
  switch (filter) {
    case "saved":
    case "purchased":
      return { href: "/catalog", label: "Перейти в каталог" };
    case "gifts":
      return { href: "/catalog?access=free", label: "Перейти в каталог" };
    case "uploads":
      return {
        href: "/my-library/private-audio/new",
        label: "Добавить своё аудио",
      };
    case "playlists":
      return { href: "/playlists/catalog", label: "Перейти к плейлистам" };
    case "all":
      return { href: "/catalog", label: "Перейти в каталог" };
    default:
      return null;
  }
}
