const NBSP = "\u00A0";

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

export function isProductFree(
  isFree: boolean | null | undefined,
  price: number | null | undefined,
): boolean {
  if (isFree === true) {
    return true;
  }

  return typeof price === "number" && Number.isFinite(price) && price <= 0;
}

/** Formats a positive ruble amount with thin NBSP grouping, e.g. `1 888 ₽`. */
export function formatRubles(price: number): string {
  const formatted = rubFormatter.format(price).replace(/\s/g, NBSP);
  return `${formatted}${NBSP}₽`;
}

export function getProductPriceLabel(
  price: number | null | undefined,
  isFree: boolean | null | undefined,
): string {
  if (isProductFree(isFree, price)) {
    return "Подарок";
  }

  if (typeof price === "number" && Number.isFinite(price) && price > 0) {
    return formatRubles(price);
  }

  return "Цена уточняется";
}

/** Paid catalog/commerce label; null when price is not a positive amount. */
export function formatPracticePrice(price: number | null | undefined): string | null {
  if (typeof price === "number" && Number.isFinite(price) && price > 0) {
    return formatRubles(price);
  }

  return null;
}
