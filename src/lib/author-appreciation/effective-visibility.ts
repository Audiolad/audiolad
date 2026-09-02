import {
  isAuthorCommercialActiveAccess,
  type AuthorAccessStatus,
} from "@/lib/authors/access";
import { normalizeProductKind, PRODUCT_KIND } from "@/lib/author-products/product-kind";
import { isCoursePublication } from "@/lib/author-products/publication-class";
import { parseCatalogVisibility } from "@/lib/products/catalog-visibility";

export type AuthorAppreciationSettings = {
  enabled: boolean;
  profileEnabled: boolean;
  freeProductsDefault: boolean;
};

export const DEFAULT_AUTHOR_APPRECIATION_SETTINGS: AuthorAppreciationSettings = {
  enabled: true,
  profileEnabled: true,
  freeProductsDefault: true,
};

export type AppreciationProductFacts = {
  status: string | null | undefined;
  isFree: boolean | null | undefined;
  publicationClass: string | null | undefined;
  productKind: string | null | undefined;
  catalogVisibility: string | null | undefined;
  isCatalogListed: boolean | null | undefined;
  override: boolean | null | undefined;
};

export function isAuthorAppreciationPreviewActive(
  value: string | null | undefined,
): boolean {
  return value === "1";
}

export function resolveAuthorAppreciationSettings(
  settings: Partial<AuthorAppreciationSettings> | null | undefined,
): AuthorAppreciationSettings {
  return {
    enabled: settings?.enabled ?? DEFAULT_AUTHOR_APPRECIATION_SETTINGS.enabled,
    profileEnabled:
      settings?.profileEnabled ??
      DEFAULT_AUTHOR_APPRECIATION_SETTINGS.profileEnabled,
    freeProductsDefault:
      settings?.freeProductsDefault ??
      DEFAULT_AUTHOR_APPRECIATION_SETTINGS.freeProductsDefault,
  };
}

export function isAppreciationProductEligible(
  product: AppreciationProductFacts,
): boolean {
  if (product.status !== "published" || product.isFree !== true) return false;
  if (isCoursePublication(product.publicationClass, product.productKind)) return false;
  if (
    parseCatalogVisibility(product.catalogVisibility, product.isCatalogListed) ===
    "selected_users"
  ) {
    return false;
  }

  const kind = normalizeProductKind(product.productKind);
  return kind === PRODUCT_KIND.PRACTICE || kind === PRODUCT_KIND.AUDIO_POST;
}

export function resolveAuthorAppreciationVisibility(input: {
  surface: "author" | "product";
  previewActive: boolean;
  accessStatus: AuthorAccessStatus | string | null | undefined;
  settings?: Partial<AuthorAppreciationSettings> | null;
  product?: AppreciationProductFacts;
}): boolean {
  if (!input.previewActive || !isAuthorCommercialActiveAccess(input.accessStatus)) {
    return false;
  }

  const settings = resolveAuthorAppreciationSettings(input.settings);
  if (!settings.enabled) return false;
  if (input.surface === "author") return settings.profileEnabled;
  if (!input.product || !isAppreciationProductEligible(input.product)) return false;

  return input.product.override ?? settings.freeProductsDefault;
}
