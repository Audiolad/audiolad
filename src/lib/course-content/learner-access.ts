import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canAccessCourseContent,
  evaluateCourseContentAccess,
  resolveProductAccess,
  type CourseContentAccessInput,
  type CourseContentAccessOptions,
  type ProductAccessResult,
} from "@/lib/products/access";
import { isCoursePublication } from "@/lib/course-content/validators";

export type CourseLearnerAccessSnapshot = {
  canReadPrivateContent: boolean;
  accessLevel: number | null;
  privileged: boolean;
};

export type CourseLearnerAccess = CourseLearnerAccessSnapshot & {
  productAccess: ProductAccessResult;
  canAccessRequiredLevel: (requiredLevel: number) => boolean;
};

export type CourseLearnerAccessOptions = CourseContentAccessOptions & {
  isPlatformAdminResolved?: boolean;
};

/**
 * Canonical learner gate for course lessons and assets.
 * Builds on canAccessCourseContent: expired / unpublished / archived / owner
 * semantics stay in resolveProductAccess + evaluateCourseContentAccess.
 *
 * Privileged bypass (author member, true platform admin) is separate from
 * accessLevel. access_source=admin with level 1 is Level 1 only.
 */
export function evaluateCourseLearnerAccess(input: {
  userId: string | null;
  publicationClass?: string | null;
  productKind?: string | null;
  access: ProductAccessResult;
  isPlatformAdmin: boolean;
}): CourseLearnerAccessSnapshot {
  const canReadPrivateContent = evaluateCourseContentAccess({
    userId: input.userId,
    publicationClass: input.publicationClass,
    productKind: input.productKind,
    access: input.access,
    isPlatformAdmin: input.isPlatformAdmin,
  });

  const privileged = Boolean(
    input.userId &&
      (input.access.reason === "author_owner" ||
        input.access.isAuthorMember ||
        input.isPlatformAdmin),
  );

  return {
    canReadPrivateContent,
    accessLevel: canReadPrivateContent ? input.access.accessLevel : null,
    privileged,
  };
}

export function canAccessRequiredLevel(
  access: CourseLearnerAccessSnapshot,
  requiredLevel: number,
): boolean {
  if (!access.canReadPrivateContent) {
    return false;
  }

  if (access.privileged) {
    return true;
  }

  if (access.accessLevel == null) {
    return false;
  }

  const required =
    typeof requiredLevel === "number" &&
    Number.isInteger(requiredLevel) &&
    requiredLevel >= 1
      ? requiredLevel
      : 1;

  return access.accessLevel >= required;
}

export function attachCourseLearnerAccessHelpers(
  snapshot: CourseLearnerAccessSnapshot,
  productAccess: ProductAccessResult,
): CourseLearnerAccess {
  return {
    ...snapshot,
    productAccess,
    canAccessRequiredLevel: (requiredLevel: number) =>
      canAccessRequiredLevel(snapshot, requiredLevel),
  };
}

export async function resolveCourseLearnerAccess(
  supabase: SupabaseClient,
  practice: CourseContentAccessInput,
  userId: string | null,
  options?: CourseLearnerAccessOptions,
): Promise<CourseLearnerAccess> {
  if (!userId || !isCoursePublication(practice.publication_class, practice.product_kind)) {
    const productAccess =
      options?.access ??
      ({
        canListen: false,
        canAcquire: false,
        isPubliclyListed: false,
        reason: userId ? "payment_required" : "not_authenticated",
        isAuthorMember: false,
        accessSource: null,
        hasEntitlement: false,
        accessLevel: null,
      } satisfies ProductAccessResult);

    return attachCourseLearnerAccessHelpers(
      {
        canReadPrivateContent: false,
        accessLevel: null,
        privileged: false,
      },
      productAccess,
    );
  }

  const productAccess =
    options?.access ?? (await resolveProductAccess(supabase, practice, userId));

  let isPlatformAdmin = options?.isPlatformAdminResolved ?? false;

  if (options?.isPlatformAdminResolved == null) {
    if (productAccess.reason === "author_owner" || productAccess.isAuthorMember) {
      isPlatformAdmin = false;
    } else {
      const checkAdmin =
        options?.isPlatformAdmin ??
        (await import("@/lib/auth/platform-admin")).isPlatformAdmin;
      isPlatformAdmin = await checkAdmin(supabase, userId);
    }
  }

  const snapshot = evaluateCourseLearnerAccess({
    userId,
    publicationClass: practice.publication_class,
    productKind: practice.product_kind,
    access: productAccess,
    isPlatformAdmin,
  });

  return attachCourseLearnerAccessHelpers(snapshot, productAccess);
}

export async function resolveCourseLearnerAccessAfterProductAccess(
  supabase: SupabaseClient,
  practice: CourseContentAccessInput,
  userId: string | null,
  productAccess: ProductAccessResult,
  options?: Omit<CourseLearnerAccessOptions, "access">,
): Promise<CourseLearnerAccess> {
  return resolveCourseLearnerAccess(supabase, practice, userId, {
    ...options,
    access: productAccess,
  });
}

/** Re-export for callers that still need the binary gate beside the level resolver. */
export { canAccessCourseContent };
