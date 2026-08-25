import { minorToRubles, RUB_CURRENCY, rublesToMinor } from "@/lib/pricing/money";
import { formatRubles } from "@/lib/products/price-format";

import type {
  CatalogDefaultOffer,
  CatalogMoney,
  CatalogPaidOffer,
} from "@/lib/catalog/dto";

export function catalogMoneyFromRubles(
  rubles: number | null | undefined,
): CatalogMoney | null {
  if (typeof rubles !== "number" || !Number.isInteger(rubles) || rubles <= 0) {
    return null;
  }

  return {
    amount_minor: rublesToMinor(rubles),
    currency: RUB_CURRENCY,
  };
}

export function formatCatalogMoney(
  price: CatalogMoney | null | undefined,
): string | null {
  if (!price || price.currency !== RUB_CURRENCY) {
    return null;
  }

  if (!Number.isInteger(price.amount_minor) || price.amount_minor <= 0) {
    return null;
  }

  try {
    return formatRubles(minorToRubles(price.amount_minor));
  } catch {
    return null;
  }
}

export function readPaidCatalogOfferPriceLabel(
  offer: CatalogDefaultOffer,
): string | null {
  if (offer?.access !== "paid") {
    return null;
  }

  return formatCatalogMoney(offer.price);
}

export function listingOfferAmountMinor(
  offer: CatalogDefaultOffer,
): number {
  if (offer?.access === "paid") {
    return offer.price.amount_minor;
  }

  return 0;
}

export function isPaidCatalogOffer(
  offer: CatalogDefaultOffer,
): offer is CatalogPaidOffer {
  return offer?.access === "paid";
}
