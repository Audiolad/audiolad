/**
 * Product VISIBILITY — who may see a product in catalog / PDP discovery.
 *
 * Strictly separate from:
 *   ACCESS = entitlement / user_practices
 *   SAVE   = bookmark / library_saves
 *
 * Visibility never grants listen access and never writes user_practices.
 */

export const CATALOG_VISIBILITY = {
  LISTED: "listed",
  UNLISTED: "unlisted",
  SELECTED_USERS: "selected_users",
} as const;

export type CatalogVisibility =
  (typeof CATALOG_VISIBILITY)[keyof typeof CATALOG_VISIBILITY];

const CATALOG_VISIBILITY_VALUES = new Set<string>(
  Object.values(CATALOG_VISIBILITY),
);

export function isCatalogVisibility(value: unknown): value is CatalogVisibility {
  return typeof value === "string" && CATALOG_VISIBILITY_VALUES.has(value);
}

/**
 * Parse the stored visibility mode.
 * Legacy rows may only have `is_catalog_listed`:
 *   true  → listed
 *   false → unlisted (never selected_users)
 */
export function parseCatalogVisibility(
  catalogVisibility?: string | null,
  isCatalogListed?: boolean | null,
): CatalogVisibility {
  if (isCatalogVisibility(catalogVisibility)) {
    return catalogVisibility;
  }

  return isCatalogListed === false
    ? CATALOG_VISIBILITY.UNLISTED
    : CATALOG_VISIBILITY.LISTED;
}

export function catalogVisibilityToListedFlag(
  visibility: CatalogVisibility,
): boolean {
  return visibility === CATALOG_VISIBILITY.LISTED;
}

export function listedFlagToCatalogVisibility(
  isCatalogListed: boolean,
): CatalogVisibility {
  return isCatalogListed
    ? CATALOG_VISIBILITY.LISTED
    : CATALOG_VISIBILITY.UNLISTED;
}

export function isListedCatalogVisibility(
  catalogVisibility?: string | null,
  isCatalogListed?: boolean | null,
): boolean {
  return (
    parseCatalogVisibility(catalogVisibility, isCatalogListed) ===
    CATALOG_VISIBILITY.LISTED
  );
}

export function isUnlistedCatalogVisibility(
  catalogVisibility?: string | null,
  isCatalogListed?: boolean | null,
): boolean {
  return (
    parseCatalogVisibility(catalogVisibility, isCatalogListed) ===
    CATALOG_VISIBILITY.UNLISTED
  );
}

export function isSelectedUsersCatalogVisibility(
  catalogVisibility?: string | null,
  isCatalogListed?: boolean | null,
): boolean {
  return (
    parseCatalogVisibility(catalogVisibility, isCatalogListed) ===
    CATALOG_VISIBILITY.SELECTED_USERS
  );
}

/** Direct-link PDP is public for listed + unlisted published products. */
export function isDirectLinkPublicVisibility(
  catalogVisibility?: string | null,
  isCatalogListed?: boolean | null,
): boolean {
  const visibility = parseCatalogVisibility(
    catalogVisibility,
    isCatalogListed,
  );
  return (
    visibility === CATALOG_VISIBILITY.LISTED ||
    visibility === CATALOG_VISIBILITY.UNLISTED
  );
}

/**
 * Ordinary catalog eligibility for a single row, given the viewer.
 * `unlisted` never appears. `selected_users` only for allowlisted viewers.
 * Granted / saved hiding is applied separately in the server query.
 */
export function isOrdinaryCatalogEligible(input: {
  status?: string | null;
  catalogVisibility?: string | null;
  isCatalogListed?: boolean | null;
  allowlisted?: boolean;
}): boolean {
  if (input.status !== "published") {
    return false;
  }

  const visibility = parseCatalogVisibility(
    input.catalogVisibility,
    input.isCatalogListed,
  );

  if (visibility === CATALOG_VISIBILITY.LISTED) {
    return true;
  }

  return visibility === CATALOG_VISIBILITY.SELECTED_USERS && input.allowlisted === true;
}

export function shouldIndexByCatalogVisibility(
  catalogVisibility?: string | null,
  isCatalogListed?: boolean | null,
): boolean {
  return isListedCatalogVisibility(catalogVisibility, isCatalogListed);
}

/**
 * robots follow: listed and unlisted follow; selected_users and
 * unpublished/draft do not.
 */
export function shouldFollowByCatalogVisibility(
  published: boolean,
  catalogVisibility?: string | null,
  isCatalogListed?: boolean | null,
): boolean {
  if (!published) {
    return false;
  }

  return isDirectLinkPublicVisibility(catalogVisibility, isCatalogListed);
}

export function shouldEmitPublicJsonLdByVisibility(
  catalogVisibility?: string | null,
  isCatalogListed?: boolean | null,
): boolean {
  return isListedCatalogVisibility(catalogVisibility, isCatalogListed);
}

export function shouldNotifyIndexNowByVisibility(
  catalogVisibility?: string | null,
  isCatalogListed?: boolean | null,
): boolean {
  return isListedCatalogVisibility(catalogVisibility, isCatalogListed);
}

export type PracticeRobotsDirective = {
  index: boolean;
  follow: boolean;
};

export function resolvePracticeRobots(input: {
  published: boolean;
  catalogVisibility?: string | null;
  isCatalogListed?: boolean | null;
}): PracticeRobotsDirective | undefined {
  const index =
    input.published &&
    shouldIndexByCatalogVisibility(
      input.catalogVisibility,
      input.isCatalogListed,
    );

  if (index) {
    return undefined;
  }

  return {
    index: false,
    follow: shouldFollowByCatalogVisibility(
      input.published,
      input.catalogVisibility,
      input.isCatalogListed,
    ),
  };
}
