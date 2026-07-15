import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductAccessReason =
  | "free"
  | "purchased"
  | "granted"
  | "author_owner"
  | "admin"
  | "not_authenticated"
  | "payment_required";

export type ProductAccessResult = {
  canListen: boolean;
  reason: ProductAccessReason;
  isAuthorMember: boolean;
  accessSource: string | null;
};

type PracticeAccessInput = {
  id: string;
  author_id: string;
  is_free: boolean | null;
  status: string | null;
};

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
): Exclude<ProductAccessReason, "free" | "author_owner" | "not_authenticated" | "payment_required"> {
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
  practice: PracticeAccessInput,
  userId: string | null,
): Promise<ProductAccessResult> {
  const isPublished = practice.status === "published";
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
        reason: "author_owner",
        isAuthorMember: true,
        accessSource: null,
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
        canListen: true,
        reason: mapAccessSourceToReason(accessSource),
        isAuthorMember: false,
        accessSource,
      };
    }
  }

  if (practice.is_free === true && isPublished) {
    return {
      canListen: true,
      reason: "free",
      isAuthorMember: false,
      accessSource: null,
    };
  }

  return {
    canListen: false,
    reason: userId ? "payment_required" : "not_authenticated",
    isAuthorMember: false,
    accessSource: null,
  };
}
