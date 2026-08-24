import { isLibraryGiftItem, type LibraryFilterItem } from "@/lib/library/filters";

export type LibraryCardBadgeId = "saved" | "gift" | "available";

export type LibraryCardBadge = {
  id: LibraryCardBadgeId;
  label: string;
};

/**
 * Access wins over save.
 * Save-only → Сохранено. Gift listen → Подарок. Purchase / other listen → Доступно.
 */
export function resolveLibraryCardBadge(
  item: Pick<LibraryFilterItem, "accessSource" | "isSaved" | "canListen" | "practice">,
): LibraryCardBadge | null {
  if (item.canListen) {
    if (isLibraryGiftItem(item)) {
      return { id: "gift", label: "Подарок" };
    }

    return { id: "available", label: "Доступно" };
  }

  if (item.isSaved) {
    return { id: "saved", label: "Сохранено" };
  }

  return null;
}

export function canUseLibraryFullListen(item: {
  canListen: boolean;
}): boolean {
  return item.canListen === true;
}

export function canShowLibraryPaidSaveOffer(item: {
  canListen: boolean;
  isSaved?: boolean;
  practice: { isFree: boolean | null; price: number | null } | null;
}): boolean {
  if (item.canListen || !item.practice) {
    return false;
  }

  const price = item.practice.price;
  if (item.practice.isFree === true) {
    return false;
  }

  return typeof price === "number" && Number.isFinite(price) && price > 0;
}
