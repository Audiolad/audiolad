import type { SupabaseClient } from "@supabase/supabase-js";

import { isAudioPostProductKind } from "@/lib/author-products/product-kind";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { isCoursePublication } from "@/lib/course-content/validators";

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
}): boolean {
  return (
    isPracticePublished(practice.status) && practice.is_catalog_listed !== false
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

export function canAcquirePractice(practice: ProductAccessInput): boolean {
  if (!isPracticePublished(practice.status)) {
    return false;
  }

  if (practice.is_catalog_listed === false) {
    return false;
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

export async function resolveProductAccess(
  supabase: SupabaseClient,
  practice: ProductAccessInput,
  userId: string | null,
): Promise<ProductAccessResult> {
  const isPubliclyListed = isPracticeCatalogListed(practice);
  const canAcquire = canAcquirePractice(practice);
  let isAuthorMember = false;

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

    if (isAuthorMember) {
      return {
        canListen: true,
        canAcquire,
        isPubliclyListed,
        reason: "author_owner",
        isAuthorMember: true,
        accessSource: null,
        hasEntitlement: false,
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
      };
    }
  }

  // Free audio posts stay listenable by direct link even when unlisted.
  // Catalog claim / acquire remains gated by is_catalog_listed separately.
  const freeAudioPostListen =
    isAudioPostProductKind(practice.product_kind) &&
    practice.is_free === true &&
    isPracticePublished(practice.status);

  if (
    (practice.is_free === true &&
      isPracticePublished(practice.status) &&
      isPubliclyListed) ||
    freeAudioPostListen
  ) {
    return {
      canListen: true,
      canAcquire: false,
      isPubliclyListed,
      reason: "free",
      isAuthorMember: false,
      accessSource: null,
      hasEntitlement: false,
    };
  }

  if (
    practice.guest_access_enabled === true &&
    isPracticePublished(practice.status)
  ) {
    return {
      canListen: true,
      canAcquire: false,
      isPubliclyListed,
      reason: "guest_promo",
      isAuthorMember: false,
      accessSource: null,
      hasEntitlement: false,
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

  const checkAdmin = options?.isPlatformAdmin ?? isPlatformAdmin;
  const platformAdmin = await checkAdmin(supabase, userId);

  return evaluateCourseContentAccess({
    userId,
    publicationClass: practice.publication_class,
    productKind: practice.product_kind,
    access,
    isPlatformAdmin: platformAdmin,
  });
}
