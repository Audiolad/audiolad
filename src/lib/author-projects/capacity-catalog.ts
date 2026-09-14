/**
 * Server-authoritative catalog for one-time author project capacity packs.
 * Never trust client amount/slots — always resolve by SKU here (and in SQL).
 */

export const AUTHOR_PROJECT_CAPACITY_ORDER_KIND =
  "author_project_capacity" as const;

export type AuthorProjectCapacityOrderKind =
  typeof AUTHOR_PROJECT_CAPACITY_ORDER_KIND;

export type AuthorProjectCapacitySku =
  | "author_project_slot_1"
  | "author_project_slots_5";

export type AuthorProjectCapacityPackage = {
  sku: AuthorProjectCapacitySku;
  slots: 1 | 5;
  amountMinor: number;
  /** Marketing/compare-at amount in kopecks; null when not shown. */
  displayAmountMinor: number | null;
  currency: "RUB";
  title: string;
  recommended: boolean;
};

export const AUTHOR_PROJECT_CAPACITY_PACKAGES: Record<
  AuthorProjectCapacitySku,
  AuthorProjectCapacityPackage
> = {
  author_project_slot_1: {
    sku: "author_project_slot_1",
    slots: 1,
    amountMinor: 99_900,
    displayAmountMinor: null,
    currency: "RUB",
    title: "+1 проект",
    recommended: false,
  },
  author_project_slots_5: {
    sku: "author_project_slots_5",
    slots: 5,
    amountMinor: 249_900,
    displayAmountMinor: 499_500,
    currency: "RUB",
    title: "+5 проектов",
    recommended: true,
  },
};

export const AUTHOR_PROJECT_CAPACITY_SKU_LIST = Object.keys(
  AUTHOR_PROJECT_CAPACITY_PACKAGES,
) as AuthorProjectCapacitySku[];

export function isAuthorProjectCapacitySku(
  value: string,
): value is AuthorProjectCapacitySku {
  return value in AUTHOR_PROJECT_CAPACITY_PACKAGES;
}

export function resolveAuthorProjectCapacityPackage(
  sku: string,
): AuthorProjectCapacityPackage | null {
  if (!isAuthorProjectCapacitySku(sku)) {
    return null;
  }
  return AUTHOR_PROJECT_CAPACITY_PACKAGES[sku];
}

export function formatCapacityRublesFromMinor(amountMinor: number): string {
  const rubles = Math.round(amountMinor / 100);
  return `${rubles.toLocaleString("ru-RU")} ₽`;
}

export function capacitySuccessMessage(slots: number): string {
  if (slots === 1) {
    return "Готово — вам доступен ещё 1 проект.";
  }
  return `Готово — вам доступны ещё ${slots} проектов.`;
}
