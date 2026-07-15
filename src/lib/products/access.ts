import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductAccessReason =
  | "free"
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

/** Entitled users may listen to products that were taken off sale but not deleted. */
export function canEntitledUserAccessPracticeStatus(
  status: string | null | undefined,
): boolean {
  return isPracticePublished(status) || isPracticeArchived(status);
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

  if (practice.is_free === true && isPracticePublished(practice.status) && isPubliclyListed) {
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
