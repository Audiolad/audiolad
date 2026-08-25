import {
  isPublicationClass,
  type PublicationClass,
} from "@/lib/catalog/dto";
import {
  PRODUCT_KIND,
  normalizeProductKind,
  type ProductKind,
} from "@/lib/author-products/product-kind";

export type { PublicationClass };

export const CABINET_BRANCH = {
  PRODUCT: "product",
  MUSIC: "music",
  POST: "post",
} as const;

export type CabinetBranch = (typeof CABINET_BRANCH)[keyof typeof CABINET_BRANCH];

export const CABINET_BRANCHES = [
  CABINET_BRANCH.PRODUCT,
  CABINET_BRANCH.MUSIC,
  CABINET_BRANCH.POST,
] as const;

export const PRODUCT_PUBLICATION_CLASSES = [
  "practice",
  "course",
  "audiobook",
] as const;

export type ProductPublicationClass =
  (typeof PRODUCT_PUBLICATION_CLASSES)[number];

export const CABINET_BRANCH_LABELS: Record<CabinetBranch, string> = {
  product: "Продукт",
  music: "Музыка",
  post: "Аудиопост",
};

export const AUTHOR_PUBLICATION_CLASS_LABELS: Record<PublicationClass, string> =
  {
    practice: "Аудиопрактика",
    course: "Аудиокурс",
    audiobook: "Аудиокнига",
    release: "Музыка",
    post: "Аудиопост",
  };

export function parsePublicationClass(
  value: string | null | undefined,
): PublicationClass | null {
  if (!isPublicationClass(value)) {
    return null;
  }

  return value;
}

export function parseCabinetBranch(
  value: string | null | undefined,
): CabinetBranch | null {
  switch (value) {
    case CABINET_BRANCH.PRODUCT:
    case CABINET_BRANCH.MUSIC:
    case CABINET_BRANCH.POST:
      return value;
    default:
      return null;
  }
}

export function isProductPublicationClass(
  value: string | null | undefined,
): value is ProductPublicationClass {
  return (
    value === "practice" || value === "course" || value === "audiobook"
  );
}

export function publicationClassToLegacyKind(
  publicationClass: PublicationClass,
): ProductKind {
  switch (publicationClass) {
    case "release":
      return PRODUCT_KIND.MUSIC;
    case "post":
      return PRODUCT_KIND.AUDIO_POST;
    default:
      return PRODUCT_KIND.PRACTICE;
  }
}

export function mapLegacyProductKindToClass(
  productKind: string | null | undefined,
): PublicationClass {
  switch (normalizeProductKind(productKind)) {
    case PRODUCT_KIND.MUSIC:
      return "release";
    case PRODUCT_KIND.AUDIO_POST:
      return "post";
    default:
      return "practice";
  }
}

export function publicationClassToCabinetBranch(
  publicationClass: PublicationClass,
): CabinetBranch {
  switch (publicationClass) {
    case "release":
      return CABINET_BRANCH.MUSIC;
    case "post":
      return CABINET_BRANCH.POST;
    default:
      return CABINET_BRANCH.PRODUCT;
  }
}

export function cabinetBranchToDefaultClass(
  branch: CabinetBranch,
): PublicationClass {
  switch (branch) {
    case CABINET_BRANCH.MUSIC:
      return "release";
    case CABINET_BRANCH.POST:
      return "post";
    default:
      return "practice";
  }
}

/**
 * Catalog/read resolver: explicit publication_class wins.
 * NULL/invalid class falls back to the legacy product_kind shadow.
 * Format is never consulted.
 */
export function resolvePublicationClass(
  publicationClass: string | null | undefined,
  productKind: string | null | undefined,
): PublicationClass {
  return (
    parsePublicationClass(publicationClass) ??
    mapLegacyProductKindToClass(productKind)
  );
}

/**
 * Product Gallery is for product classes only: practice, course, audiobook.
 * Release (Music) and post (AudioPost) are never eligible.
 */
export function isProductGalleryClass(
  publicationClass: PublicationClass,
): boolean {
  return isProductPublicationClass(publicationClass);
}

export function isProductGalleryEligible(
  publicationClass: string | null | undefined,
  productKind: string | null | undefined,
): boolean {
  return isProductGalleryClass(
    resolvePublicationClass(publicationClass, productKind),
  );
}

export type CreateClassification = {
  publicationClass: PublicationClass;
  productKind: ProductKind;
  cabinetBranch: CabinetBranch;
};

export function isExplicitProductKind(
  value: string | null | undefined,
): value is ProductKind {
  return (
    value === PRODUCT_KIND.PRACTICE ||
    value === PRODUCT_KIND.MUSIC ||
    value === PRODUCT_KIND.AUDIO_POST
  );
}

function readOptionalString(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

export function resolveCreateClassification(input: {
  publicationClass?: string | null;
  cabinetBranch?: string | null;
  productKind?: string | null;
}):
  | { ok: true; value: CreateClassification }
  | { ok: false; error: string } {
  const explicitClassRaw = readOptionalString(input.publicationClass);
  const explicitBranchRaw = readOptionalString(input.cabinetBranch);
  const explicitKindRaw = readOptionalString(input.productKind);

  const explicitClass = explicitClassRaw
    ? parsePublicationClass(explicitClassRaw)
    : null;

  if (explicitClassRaw && !explicitClass) {
    return { ok: false, error: "invalid_publication_class" };
  }

  const explicitBranch = explicitBranchRaw
    ? parseCabinetBranch(explicitBranchRaw)
    : null;

  if (explicitBranchRaw && !explicitBranch) {
    return { ok: false, error: "invalid_cabinet_branch" };
  }

  let explicitKind: ProductKind | null = null;

  if (explicitKindRaw) {
    if (!isExplicitProductKind(explicitKindRaw)) {
      return { ok: false, error: "invalid_product_kind" };
    }

    explicitKind = explicitKindRaw;
  }

  if (explicitClass) {
    const productKind = publicationClassToLegacyKind(explicitClass);
    const cabinetBranch = publicationClassToCabinetBranch(explicitClass);

    if (explicitBranch && explicitBranch !== cabinetBranch) {
      return { ok: false, error: "invalid_cabinet_branch" };
    }

    if (explicitKind && explicitKind !== productKind) {
      return { ok: false, error: "invalid_product_kind" };
    }

    return {
      ok: true,
      value: {
        publicationClass: explicitClass,
        productKind,
        cabinetBranch,
      },
    };
  }

  if (explicitBranch) {
    const publicationClass = cabinetBranchToDefaultClass(explicitBranch);

    if (
      explicitKind &&
      explicitKind !== publicationClassToLegacyKind(publicationClass)
    ) {
      return { ok: false, error: "invalid_product_kind" };
    }

    return {
      ok: true,
      value: {
        publicationClass,
        productKind: publicationClassToLegacyKind(publicationClass),
        cabinetBranch: explicitBranch,
      },
    };
  }

  if (explicitKind) {
    const publicationClass = mapLegacyProductKindToClass(explicitKind);

    return {
      ok: true,
      value: {
        publicationClass,
        productKind: explicitKind,
        cabinetBranch: publicationClassToCabinetBranch(publicationClass),
      },
    };
  }

  return {
    ok: true,
    value: {
      publicationClass: "practice",
      productKind: PRODUCT_KIND.PRACTICE,
      cabinetBranch: CABINET_BRANCH.PRODUCT,
    },
  };
}

export function getAuthorPublicationClassLabel(
  publicationClass: string | null | undefined,
): string {
  const parsed = parsePublicationClass(publicationClass);

  if (!parsed) {
    return AUTHOR_PUBLICATION_CLASS_LABELS.practice;
  }

  return AUTHOR_PUBLICATION_CLASS_LABELS[parsed];
}
