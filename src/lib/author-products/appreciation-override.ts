import { authorAccessAllowsPaidProducts } from "@/lib/authors/access";
import { PRODUCT_KIND } from "@/lib/author-products/product-kind";

export const APPRECIATION_NOT_ELIGIBLE = "appreciation_not_eligible" as const;

export function canConfigureProductAppreciation(input: {
  accessStatus: string | null | undefined;
  isFree: boolean;
  productKind: string | null | undefined;
  publicationClass: string | null | undefined;
}): boolean {
  return (
    authorAccessAllowsPaidProducts(input.accessStatus) &&
    input.isFree === true &&
    (input.productKind === PRODUCT_KIND.PRACTICE ||
      input.productKind === PRODUCT_KIND.AUDIO_POST) &&
    input.publicationClass !== "course"
  );
}

export type AppreciationOverridePatchResult =
  | { action: "omit" }
  | { action: "apply"; value: boolean | null }
  | { action: "reject"; error: typeof APPRECIATION_NOT_ELIGIBLE };

/**
 * PATCH rule for `listener_appreciation_override`.
 * Omitted key: no update.
 * Ineligible author/product + null: stale-client no-op (do not write, do not 400).
 * Ineligible + any non-null value: reject.
 * Eligible: apply boolean or null (inherit author default). Invalid type still rejects.
 */
export function resolveAppreciationOverridePatch(input: {
  present: boolean;
  override: unknown;
  accessStatus: string | null | undefined;
  isFree: boolean;
  productKind: string | null | undefined;
  publicationClass: string | null | undefined;
}): AppreciationOverridePatchResult {
  if (!input.present) {
    return { action: "omit" };
  }

  const eligible = canConfigureProductAppreciation({
    accessStatus: input.accessStatus,
    isFree: input.isFree,
    productKind: input.productKind,
    publicationClass: input.publicationClass,
  });

  if (!eligible) {
    if (input.override === null) {
      return { action: "omit" };
    }

    return { action: "reject", error: APPRECIATION_NOT_ELIGIBLE };
  }

  if (input.override !== null && typeof input.override !== "boolean") {
    return { action: "reject", error: APPRECIATION_NOT_ELIGIBLE };
  }

  return { action: "apply", value: input.override };
}
