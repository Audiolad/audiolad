/**
 * Shared author-facing discovery reservation semantics.
 *
 * Active = still in progress («У вас в работе»).
 * Used = already taken by a product («Опубликован» for the owner).
 *
 * Product-create selection hides any query that cannot become a new product.
 * This module is client-safe so UI and API share one decision helper.
 */

export const AUTHOR_SEO_DISCOVERY_SURFACES = {
  OPPORTUNITIES: "opportunities",
  PRODUCT_CREATE: "product_create",
} as const;

export type AuthorSeoDiscoverySurface =
  (typeof AUTHOR_SEO_DISCOVERY_SURFACES)[keyof typeof AUTHOR_SEO_DISCOVERY_SURFACES];

export type AuthorDiscoveryReservationStatus =
  | "available"
  | "occupied"
  | "own"
  | "published";

export type AuthorDiscoveryReservationLabel =
  | "Свободен"
  | "Занят"
  | "У вас в работе"
  | "Опубликован";

export type DiscoveryReservationLike = {
  id: string;
  authorId: string;
  status: string;
  productId?: string | null;
  productTitle?: string | null;
};

export type AuthorDiscoveryReservationState = {
  status: AuthorDiscoveryReservationStatus;
  statusLabel: AuthorDiscoveryReservationLabel;
  canReserve: boolean;
  reservationId: string | null;
  productId: string | null;
  productTitle: string | null;
};

const AVAILABLE_STATE: AuthorDiscoveryReservationState = {
  status: "available",
  statusLabel: "Свободен",
  canReserve: true,
  reservationId: null,
  productId: null,
  productTitle: null,
};

export function parseAuthorSeoDiscoverySurface(
  value: unknown,
): AuthorSeoDiscoverySurface | null {
  if (
    value === AUTHOR_SEO_DISCOVERY_SURFACES.OPPORTUNITIES ||
    value === AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE
  ) {
    return value;
  }
  return null;
}

export function authorSeoDiscoverySurfaceFromPanelVariant(
  variant: "opportunities" | "product-create",
): AuthorSeoDiscoverySurface {
  return variant === "product-create"
    ? AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE
    : AUTHOR_SEO_DISCOVERY_SURFACES.OPPORTUNITIES;
}

/**
 * Used queries, or active reservations already linked to a product,
 * cannot be selected for a second product.
 */
export function isHiddenFromProductCreateDiscovery(
  reservation: Pick<DiscoveryReservationLike, "status" | "productId"> | null,
): boolean {
  if (!reservation) return false;
  if (reservation.status === "used") return true;
  return reservation.status === "active" && Boolean(reservation.productId);
}

export function resolveAuthorDiscoveryReservationState(input: {
  authorId: string;
  reservation: DiscoveryReservationLike | null;
}): AuthorDiscoveryReservationState {
  const reservation = input.reservation;
  if (!reservation) {
    return AVAILABLE_STATE;
  }

  if (reservation.status === "used") {
    if (reservation.authorId === input.authorId) {
      return {
        status: "published",
        statusLabel: "Опубликован",
        canReserve: false,
        reservationId: reservation.id,
        productId: reservation.productId ?? null,
        productTitle: reservation.productTitle ?? null,
      };
    }
    return {
      status: "occupied",
      statusLabel: "Занят",
      canReserve: false,
      reservationId: null,
      productId: null,
      productTitle: null,
    };
  }

  if (reservation.status === "active") {
    if (reservation.authorId === input.authorId) {
      return {
        status: "own",
        statusLabel: "У вас в работе",
        canReserve: false,
        reservationId: reservation.id,
        productId: reservation.productId ?? null,
        productTitle: reservation.productTitle ?? null,
      };
    }
    return {
      status: "occupied",
      statusLabel: "Занят",
      canReserve: false,
      reservationId: null,
      productId: null,
      productTitle: null,
    };
  }

  return AVAILABLE_STATE;
}

export type AuthorDiscoveryDatabaseMatchInput = {
  id: string;
  queryText: string;
  normalizedQuery: string;
  frequency: number | null;
  reservation: DiscoveryReservationLike | null;
};

export type AuthorDiscoveryDatabaseMatch = {
  phrase: string;
  frequency: number | null;
  status: AuthorDiscoveryReservationStatus;
  statusLabel: AuthorDiscoveryReservationLabel;
  queryId: string;
  reservationId: string | null;
  productId: string | null;
  productTitle: string | null;
  canReserve: boolean;
  canPropose: false;
  source: "database";
};

export function buildAuthorDiscoveryDatabaseMatches(input: {
  surface: AuthorSeoDiscoverySurface;
  authorId: string;
  items: AuthorDiscoveryDatabaseMatchInput[];
}): {
  matches: AuthorDiscoveryDatabaseMatch[];
  hiddenNormalizedQueries: string[];
} {
  const matches: AuthorDiscoveryDatabaseMatch[] = [];
  const hiddenNormalizedQueries: string[] = [];

  for (const item of input.items) {
    const hideForProductCreate =
      input.surface === AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE &&
      isHiddenFromProductCreateDiscovery(item.reservation);

    if (hideForProductCreate) {
      hiddenNormalizedQueries.push(item.normalizedQuery);
      continue;
    }

    const state = resolveAuthorDiscoveryReservationState({
      authorId: input.authorId,
      reservation: item.reservation,
    });

    matches.push({
      phrase: item.queryText,
      frequency: typeof item.frequency === "number" ? item.frequency : null,
      status: state.status,
      statusLabel: state.statusLabel,
      queryId: item.id,
      reservationId: state.reservationId,
      productId: state.productId,
      productTitle: state.productTitle,
      canReserve: state.canReserve,
      canPropose: false,
      source: "database",
    });
  }

  return { matches, hiddenNormalizedQueries };
}

export function shouldOmitFromWordstatAdditions(input: {
  surface: AuthorSeoDiscoverySurface;
  analysisStatus?: string | null;
  reservation?: Pick<DiscoveryReservationLike, "status" | "productId"> | null;
  normalized?: string | null;
  databaseNormalized: ReadonlySet<string>;
}): boolean {
  if (input.analysisStatus === "not_applicable") return true;
  if (input.analysisStatus === "analyzed") return true;
  if (input.reservation?.status === "used") return true;
  if (
    input.surface === AUTHOR_SEO_DISCOVERY_SURFACES.PRODUCT_CREATE &&
    isHiddenFromProductCreateDiscovery(input.reservation ?? null)
  ) {
    return true;
  }
  if (input.normalized && input.databaseNormalized.has(input.normalized)) {
    return true;
  }
  return false;
}

export function isHiddenFromProductCreateDiscoveryUi(item: {
  status: string;
  productId?: string | null;
}): boolean {
  if (item.status === "published") return true;
  return item.status === "own" && Boolean(item.productId);
}
