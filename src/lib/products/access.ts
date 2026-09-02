import type { SupabaseClient } from "@supabase/supabase-js";

import { isCoursePublication } from "@/lib/course-content/validators";
import {
  isListedCatalogVisibility,
  isSelectedUsersCatalogVisibility,
  parseCatalogVisibility,
  type CatalogVisibility,
} from "@/lib/products/catalog-visibility";

export type ProductAccessReason =
  | "free"
  | "guest_promo"
  | "purchased"
  | "granted"
  | "author_owner"
  | "admin"
  | "not_authenticated"
  | "payment_required"
  | "unavailable";

export type ProductAccessInput = {
  id: string;
  author_id: string;
  is_free: boolean | null;
  status: string | null;
  is_catalog_listed?: boolean | null;
  catalog_visibility?: string | null;
  guest_access_enabled?: boolean | null;
  product_kind?: string | null;
  publication_class?: string | null;
};

export type CourseContentAccessInput = ProductAccessInput;

export type CourseContentAccessOptions = {
  access?: ProductAccessResult;
  isPlatformAdmin?: (
    supabase: SupabaseClient,
    userId: string,
  ) => Promise<boolean>;
};

export type ProductAccessResult = {
  canListen: boolean;
  canAcquire: boolean;
  isPubliclyListed: boolean;
  reason: ProductAccessReason;
  isAuthorMember: boolean;
  accessSource: string | null;
  hasEntitlement: boolean;
  canSeeSelectedUsers?: boolean;
  catalogVisibility?: CatalogVisibility;
};

export function isPracticePublished(status: string | null | undefined): boolean {
  return status === "published";
}

export function isPracticeUnpublished(status: string | null | undefined): boolean {
  return status === "unpublished";
}

export function isPracticeArchived(status: string | null | undefined): boolean {
  return status === "archived";
}

export function isPracticeCatalogListed(practice: {
  status: string | null | undefined;
  is_catalog_listed?: boolean | null;
  catalog_visibility?: string | null;
}): boolean {
  return (
    isPracticePublished(practice.status) &&
    isListedCatalogVisibility(
      practice.catalog_visibility,
      practice.is_catalog_listed,
    )
  );
}

/** Entitled users may listen to products taken off sale but not deleted. */
export function canEntitledUserAccessPracticeStatus(
  status: string | null | undefined,
): boolean {
  return (
    isPracticePublished(status) ||
    isPracticeUnpublished(status) ||
    isPracticeArchived(status)
  );
}

export function canAcquirePractice(
  practice: ProductAccessInput,
  options?: { canSeeSelectedUsers?: boolean },
): boolean {
  if (!isPracticePublished(practice.status)) {
    return false;
  }

  const visibility = parseCatalogVisibility(
    practice.catalog_visibility,
    practice.is_catalog_listed,
  );

  if (visibility === "selected_users") {
    return options?.canSeeSelectedUsers === true;
  }

  return true;
}

function isEntitlementActive(expiresAt: string | null): boolean {
  if (expiresAt === null) {
    return true;
  }

  const expiresDate = new Date(expiresAt);

  if (Number.isNaN(expiresDate.getTime())) {
    return false;
  }

  return expiresDate > new Date();
}

function mapAccessSourceToReason(
  accessSource: string,
): Exclude<
  ProductAccessReason,
  | "free"
  | "author_owner"
  | "not_authenticated"
  | "payment_required"
  | "unavailable"
> {
  switch (accessSource) {
    case "purchase":
      return "purchased";
    case "admin":
      return "admin";
    default:
      return "granted";
  }
}

async function lookupSelectedUsersVisibility(
  supabase: SupabaseClient,
  practiceId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("practice_visibility_users")
    .select("user_id")
    .eq("practice_id", practiceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("visibility_allowlist_lookup_failed");
  }

  if (data?.user_id) {
    return true;
  }

  const { isPlatformAdmin } = await import("@/lib/auth/platform-admin");
  return isPlatformAdmin(supabase, userId);
}

export async function resolveProductAccess(
  supabase: SupabaseClient,
  practice: ProductAccessInput,
  userId: string | null,
): Promise<ProductAccessResult> {
  const catalogVisibility = parseCatalogVisibility(
    practice.catalog_visibility,
    practice.is_catalog_listed,
  );
  const isPubliclyListed = isPracticeCatalogListed(practice);
  const selectedUsers = isSelectedUsersCatalogVisibility(
    practice.catalog_visibility,
    practice.is_catalog_listed,
  );
  let isAuthorMember = false;
  let canSeeSelectedUsers = false;

  if (userId) {
    const { data: membership, error: membershipError } = await supabase
      .from("author_members")
      .select("id")
      .eq("author_id", practice.author_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) {
      throw new Error("author_membership_lookup_failed");
    }

    isAuthorMember = Boolean(membership?.id);
    canSeeSelectedUsers = isAuthorMember;

    if (isAuthorMember) {
      return {
        canListen: true,
        canAcquire: canAcquirePractice(practice, { canSeeSelectedUsers: true }),
        isPubliclyListed,
        reason: "author_owner",
        isAuthorMember: true,
        accessSource: null,
        hasEntitlement: false,
        canSeeSelectedUsers: true,
        catalogVisibility,
      };
    }

    const { data: entitlement, error: entitlementError } = await supabase
      .from("user_practices")
      .select("access_source, expires_at")
      .eq("user_id", userId)
      .eq("practice_id", practice.id)
      .maybeSingle();

    if (entitlementError) {
      throw new Error("entitlement_lookup_failed");
    }

    if (
      entitlement &&
      isEntitlementActive(entitlement.expires_at as string | null)
    ) {
      const accessSource =
        typeof entitlement.access_source === "string"
          ? entitlement.access_source
          : "granted";

      return {
        canListen: canEntitledUserAccessPracticeStatus(practice.status),
        canAcquire: false,
        isPubliclyListed,
        reason: mapAccessSourceToReason(accessSource),
        isAuthorMember: false,
        accessSource,
        hasEntitlement: true,
        canSeeSelectedUsers: true,
        catalogVisibility,
      };
    }

    if (selectedUsers) {
      canSeeSelectedUsers = await lookupSelectedUsersVisibility(
        supabase,
        practice.id,
        userId,
      );
    }
  }

  const canAcquire = canAcquirePractice(practice, { canSeeSelectedUsers });
  const canSeeProduct = !selectedUsers || canSeeSelectedUsers;

  // Free classification is independent of catalog listing.
  // listed = discovery; published + unlisted + is_free = gift by direct link.
  // selected_users stays closed unless the viewer is allowlisted.
  if (
    practice.is_free === true &&
    isPracticePublished(practice.status) &&
    canSeeProduct
  ) {
    return {
      canListen: true,
      canAcquire: false,
      isPubliclyListed,
      reason: "free",
      isAuthorMember: false,
      accessSource: null,
      hasEntitlement: false,
      canSeeSelectedUsers,
      catalogVisibility,
    };
  }

  if (
    practice.guest_access_enabled === true &&
    isPracticePublished(practice.status) &&
    canSeeProduct
  ) {
    return {
      canListen: true,
      canAcquire: false,
      isPubliclyListed,
      reason: "guest_promo",
      isAuthorMember: false,
      accessSource: null,
      hasEntitlement: false,
      canSeeSelectedUsers,
      catalogVisibility,
    };
  }

  if (!isPracticePublished(practice.status) && isPracticeArchived(practice.status)) {
    return {
      canListen: false,
      canAcquire: false,
      isPubliclyListed: false,
      reason: "unavailable",
      isAuthorMember: false,
      accessSource: null,
      hasEntitlement: false,
      canSeeSelectedUsers,
      catalogVisibility,
    };
  }

  return {
    canListen: false,
    canAcquire,
    isPubliclyListed,
    reason: userId ? "payment_required" : "not_authenticated",
    isAuthorMember: false,
    accessSource: null,
    hasEntitlement: false,
    canSeeSelectedUsers,
    catalogVisibility,
  };
}

/**
 * Course content is never opened by price / is_free / guest_promo / canListen.
 * Presence of a lesson/block/file row also never grants read.
 *
 * Allowed only when the publication resolves to class=course AND:
 *   hasEntitlement (free_claim / purchase / admin grant / other active
 *   user_practices row) OR author_owner OR access_source=admin OR
 *   real platform admin via isPlatformAdmin (admin_panel.access).
 *
 * resolveProductAccess reason "admin" means user_practices.access_source=admin
 * only. This helper also treats a real platform admin as allowed.
 */
export function evaluateCourseContentAccess(input: {
  userId: string | null;
  publicationClass?: string | null;
  productKind?: string | null;
  access: ProductAccessResult;
  isPlatformAdmin: boolean;
}): boolean {
  if (!input.userId) {
    return false;
  }

  if (!isCoursePublication(input.publicationClass, input.productKind)) {
    return false;
  }

  if (input.access.hasEntitlement) {
    return true;
  }

  if (input.access.reason === "author_owner") {
    return true;
  }

  if (input.access.accessSource === "admin") {
    return true;
  }

  return input.isPlatformAdmin;
}

export async function canAccessCourseContent(
  supabase: SupabaseClient,
  practice: CourseContentAccessInput,
  userId: string | null,
  options?: CourseContentAccessOptions,
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  if (!isCoursePublication(practice.publication_class, practice.product_kind)) {
    return false;
  }

  const access =
    options?.access ?? (await resolveProductAccess(supabase, practice, userId));

  if (
    access.hasEntitlement ||
    access.reason === "author_owner" ||
    access.accessSource === "admin"
  ) {
    return true;
  }

  const checkAdmin =
    options?.isPlatformAdmin ??
    (await import("@/lib/auth/platform-admin")).isPlatformAdmin;
  const platformAdmin = await checkAdmin(supabase, userId);

  return evaluateCourseContentAccess({
    userId,
    publicationClass: practice.publication_class,
    productKind: practice.product_kind,
    access,
    isPlatformAdmin: platformAdmin,
  });
}
