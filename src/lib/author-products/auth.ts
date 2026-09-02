import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import type { AuthorAccessStatus } from "@/lib/authors/access";
import {
  authorAccessAllowsContentMutations,
  authorAccessAllowsPaidProducts,
} from "@/lib/authors/access";
import {
  AuthorTermsAcceptanceRequiredError,
  authorTermsAcceptanceRequiredResponse,
} from "@/lib/author-terms/errors";
import { requireCurrentAuthorTermsAcceptance } from "@/lib/author-terms/guard";

import {
  isPracticeDeletedError,
  isPracticePublishedImmutableError,
  isPracticeUnderModerationError,
} from "@/lib/author-products/moderation";
import { isPracticeSaleLockError } from "@/lib/author-products/sale-lock";

import { hasPermission } from "@/lib/auth/platform-access";

import {
  evaluatePracticeAuthorAssignment,
  type AuthorMemberWriteRole,
} from "./author-assignment";
import type { AuthorMemberRole, AuthorWorkspace } from "./types";

export class AuthorAccessError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function jsonError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function createAuthedSupabaseClient(accessToken: string) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export async function requireAuthenticatedUser() {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;

  const supabase = bearerToken
    ? createAuthedSupabaseClient(bearerToken)
    : await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AuthorAccessError("unauthorized", 401);
  }

  if (error) {
    console.error("author_auth_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  return { supabase, user };
}

export async function listAuthorWorkspacesForUser(
  userId: string,
  supabaseClient?: SupabaseClient,
): Promise<AuthorWorkspace[]> {
  const { peekAuthorExecutionContext } = await import(
    "@/lib/author-support/context"
  );
  const { loadActingAuthorMembership } = await import(
    "@/lib/author-support/store"
  );
  const execution = await peekAuthorExecutionContext();
  if (
    execution?.isSupportMode &&
    execution.realUserId === userId &&
    execution.actingAuthorId
  ) {
    const membership = await loadActingAuthorMembership({
      actingUserId: execution.actingUserId,
      actingAuthorId: execution.actingAuthorId,
    });
    if (!membership) {
      return [];
    }
    return [
      {
        id: execution.actingAuthorId,
        name: membership.authorName,
        slug: membership.authorSlug,
        role: membership.role,
        accessStatus: membership.accessStatus,
        canBypassProductModeration: membership.canBypassProductModeration,
      },
    ];
  }

  const supabase = supabaseClient ?? (await createClient());

  const { data, error } = await supabase
    .from("author_members")
    .select(
      `
      role,
      authors!author_members_author_id_fkey (
        id,
        name,
        slug,
        access_status,
        can_bypass_product_moderation
      )
    `,
    )
    .eq("user_id", userId);

  if (error) {
    console.error("author_workspaces_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  const actorCanBypass = await hasPermission(
    supabase,
    userId,
    "author_products.moderate",
  );

  const workspaces: AuthorWorkspace[] = [];

  for (const row of data ?? []) {
    const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;

    if (!author?.id || !author.name || !author.slug) {
      continue;
    }

    if (row.role !== "owner" && row.role !== "editor") {
      continue;
    }

    workspaces.push({
      id: author.id,
      name: author.name,
      slug: author.slug,
      role: row.role as AuthorMemberRole,
      accessStatus: (author.access_status ?? "free") as AuthorAccessStatus,
      canBypassProductModeration:
        author.can_bypass_product_moderation === true || actorCanBypass,
    });
  }

  workspaces.sort((left, right) => left.name.localeCompare(right.name, "ru"));

  return workspaces;
}

export async function getAuthorAccessStatusForMembership(
  supabase: SupabaseClient,
  authorId: string,
): Promise<AuthorAccessStatus> {
  const { data, error } = await supabase
    .from("authors")
    .select("access_status")
    .eq("id", authorId)
    .maybeSingle();

  if (error) {
    console.error("author_access_status_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  return (data?.access_status ?? "free") as AuthorAccessStatus;
}

export async function requireAuthorMembership(authorId: string) {
  const { supabase, user } = await requireAuthenticatedUser();
  const {
    peekAuthorExecutionContext,
    requestedAuthorMatchesSupport,
    getAuthorDataClient,
  } = await import("@/lib/author-support/context");
  const { loadActingAuthorMembership } = await import(
    "@/lib/author-support/store"
  );
  const execution = await peekAuthorExecutionContext();

  if (execution?.isSupportMode) {
    if (!requestedAuthorMatchesSupport(execution, authorId) || !execution.actingAuthorId) {
      throw new AuthorAccessError("forbidden", 403);
    }

    const membership = await loadActingAuthorMembership({
      actingUserId: execution.actingUserId,
      actingAuthorId: execution.actingAuthorId,
    });
    if (!membership) {
      throw new AuthorAccessError("forbidden", 403);
    }

    return {
      supabase: await getAuthorDataClient(execution, supabase),
      user,
      role: membership.role,
      accessStatus: membership.accessStatus,
    };
  }

  const { data, error } = await supabase
    .from("author_members")
    .select("role")
    .eq("author_id", authorId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("author_membership_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!data || (data.role !== "owner" && data.role !== "editor")) {
    throw new AuthorAccessError("forbidden", 403);
  }

  const accessStatus = await getAuthorAccessStatusForMembership(supabase, authorId);

  return {
    supabase,
    user,
    role: data.role as AuthorMemberRole,
    accessStatus,
  };
}

export function assertAuthorContentMutationsAllowed(accessStatus: AuthorAccessStatus) {
  if (!authorAccessAllowsContentMutations(accessStatus)) {
    throw new AuthorAccessError("author_content_mutations_blocked", 403);
  }
}

export function assertAuthorPaidProductsAllowed(accessStatus: AuthorAccessStatus) {
  if (!authorAccessAllowsPaidProducts(accessStatus)) {
    throw new AuthorAccessError("paid_products_not_allowed", 403);
  }
}

/** Paid commercial write-path: access tier + current author terms acceptance. */
export async function assertAuthorCommercialWriteAllowed(
  authorId: string,
  accessStatus: AuthorAccessStatus,
) {
  assertAuthorPaidProductsAllowed(accessStatus);
  await requireCurrentAuthorTermsAcceptance(authorId);
}

export async function requireAuthorMutationMembership(
  authorId: string,
  supportAudit?: { action: string; resourceType?: string },
) {
  const context = await requireAuthorMembership(authorId);
  assertAuthorContentMutationsAllowed(context.accessStatus);
  if (supportAudit) {
    const { recordAuthorSupportAudit } = await import(
      "@/lib/author-support/audit"
    );
    await recordAuthorSupportAudit({
      action: supportAudit.action,
      resourceType: supportAudit.resourceType ?? "author",
      resourceId: authorId,
    });
  }
  return context;
}

function asWriteRole(role: string | null | undefined): AuthorMemberWriteRole | null {
  return role === "owner" || role === "editor" ? role : null;
}

/**
 * Draft saves send author_id while the slug is unlocked. Support mode must not
 * treat that as "is the real admin in author_members?".
 */
export async function authorizePracticeAuthorAssignment(input: {
  currentAuthorId: string;
  nextAuthorId: string;
  realUserId: string;
  supabase: SupabaseClient;
}): Promise<{ assign: boolean }> {
  const {
    peekAuthorExecutionContext,
    requestedAuthorMatchesSupport,
  } = await import("@/lib/author-support/context");
  const { loadActingAuthorMembership } = await import(
    "@/lib/author-support/store"
  );
  const execution = await peekAuthorExecutionContext();
  const isSupportMode = execution?.isSupportMode === true;
  const authorChanged =
    input.nextAuthorId.trim() !== input.currentAuthorId.trim();

  let realUserRoleOnNextAuthor: AuthorMemberWriteRole | null = null;
  let actingUserRoleOnNextAuthor: AuthorMemberWriteRole | null = null;

  if (authorChanged && isSupportMode) {
    if (
      execution &&
      requestedAuthorMatchesSupport(execution, input.nextAuthorId) &&
      execution.actingAuthorId
    ) {
      const membership = await loadActingAuthorMembership({
        actingUserId: execution.actingUserId,
        actingAuthorId: execution.actingAuthorId,
      });
      actingUserRoleOnNextAuthor = asWriteRole(membership?.role);
    }
  } else if (authorChanged) {
    const { data, error } = await input.supabase
      .from("author_members")
      .select("role")
      .eq("author_id", input.nextAuthorId)
      .eq("user_id", input.realUserId)
      .maybeSingle();

    if (error) {
      console.error("author_product_author_assignment_lookup_error", error.message);
      throw new AuthorAccessError("internal_error", 500);
    }

    realUserRoleOnNextAuthor = asWriteRole(data?.role);
  }

  const decision = evaluatePracticeAuthorAssignment({
    currentAuthorId: input.currentAuthorId,
    nextAuthorId: input.nextAuthorId,
    isSupportMode,
    actingAuthorId: execution?.actingAuthorId ?? null,
    realUserRoleOnNextAuthor,
    actingUserRoleOnNextAuthor,
  });

  if (!decision.ok) {
    console.error("author_product_author_assignment_denied", {
      code: decision.code,
      currentAuthorId: input.currentAuthorId,
      nextAuthorId: input.nextAuthorId,
      isSupportMode,
    });
    throw new AuthorAccessError(decision.code, 403);
  }

  return { assign: decision.assign };
}

export async function requirePracticeMutationAccess(practiceId: string) {
  const context = await requirePracticeAccess(practiceId);
  assertAuthorContentMutationsAllowed(context.accessStatus);
  const { recordAuthorSupportAudit } = await import("@/lib/author-support/audit");
  await recordAuthorSupportAudit({
    action: "product_updated",
    resourceType: "practice",
    resourceId: practiceId,
    metadata: { gate: "requirePracticeMutationAccess" },
  });
  return context;
}

export async function requirePracticeAccess(practiceId: string) {
  const { supabase, user } = await requireAuthenticatedUser();
  const {
    peekAuthorExecutionContext,
    requestedAuthorMatchesSupport,
    getAuthorDataClient,
  } = await import("@/lib/author-support/context");
  const { loadActingAuthorMembership } = await import(
    "@/lib/author-support/store"
  );
  const execution = await peekAuthorExecutionContext();
  const dataClient = execution
    ? await getAuthorDataClient(execution, supabase)
    : supabase;

  const { data: practice, error: practiceError } = await dataClient
    .from("practices")
    .select(
      "id, author_id, status, moderation_status, deleted_at, slug, published_at, use_shared_cover, is_free, product_kind, publication_class, music_usage_permission, promo_enabled, promo_title, promo_text, promo_button_text, promo_url, promo_open_in_new_tab, is_catalog_listed, catalog_visibility",
    )
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError) {
    console.error("author_practice_lookup_error", practiceError.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!practice?.id || !practice.author_id || practice.deleted_at) {
    throw new AuthorAccessError("not_found", 404);
  }

  if (execution?.isSupportMode) {
    if (!requestedAuthorMatchesSupport(execution, practice.author_id)) {
      throw new AuthorAccessError("forbidden", 403);
    }

    const membership = await loadActingAuthorMembership({
      actingUserId: execution.actingUserId,
      actingAuthorId: execution.actingAuthorId as string,
    });
    if (!membership) {
      throw new AuthorAccessError("forbidden", 403);
    }

    return {
      supabase: dataClient,
      user,
      practice: practice as {
        id: string;
        author_id: string;
        status: string;
        moderation_status: string | null;
        deleted_at: string | null;
        slug: string;
        published_at: string | null;
        use_shared_cover: boolean;
        is_free?: boolean | null;
        product_kind?: string | null;
        publication_class?: string | null;
        music_usage_permission?: string | null;
        promo_enabled?: boolean | null;
        promo_title?: string | null;
        promo_text?: string | null;
        promo_button_text?: string | null;
        promo_url?: string | null;
        promo_open_in_new_tab?: boolean | null;
      },
      role: membership.role,
      accessStatus: membership.accessStatus,
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("author_members")
    .select("role")
    .eq("author_id", practice.author_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    console.error("author_practice_membership_error", membershipError.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  const accessStatus = await getAuthorAccessStatusForMembership(
    supabase,
    practice.author_id,
  );

  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "editor")
  ) {
    throw new AuthorAccessError("forbidden", 403);
  }

  return {
    supabase,
    user,
    practice: practice as {
      id: string;
      author_id: string;
      status: string;
      moderation_status: string | null;
      deleted_at: string | null;
      slug: string;
      published_at: string | null;
      use_shared_cover: boolean;
      is_free?: boolean | null;
      product_kind?: string | null;
      publication_class?: string | null;
      music_usage_permission?: string | null;
      promo_enabled?: boolean | null;
      promo_title?: string | null;
      promo_text?: string | null;
      promo_button_text?: string | null;
      promo_url?: string | null;
      promo_open_in_new_tab?: boolean | null;
    },
    role: membership.role as AuthorMemberRole,
    accessStatus,
  };
}

export function handleAuthorRouteError(error: unknown) {
  if (error instanceof AuthorTermsAcceptanceRequiredError) {
    return authorTermsAcceptanceRequiredResponse(error);
  }

  if (error instanceof AuthorAccessError) {
    console.error("author_route_error", error.code, error.status);

    return jsonError(error.code, error.status);
  }

  if (isPracticeSaleLockError(error)) {
    return NextResponse.json(
      {
        error: error.code,
        message: error.userMessage,
      },
      { status: error.status },
    );
  }

  if (isPracticeUnderModerationError(error)) {
    return NextResponse.json(
      {
        error: error.code,
        message: error.userMessage,
      },
      { status: error.status },
    );
  }

  if (
    isPracticePublishedImmutableError(error) ||
    isPracticeDeletedError(error)
  ) {
    return NextResponse.json(
      {
        error: error.code,
        message: error.userMessage,
      },
      { status: error.status },
    );
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "author_support_audit_failed" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return jsonError("author_support_audit_failed", error.status);
  }

  if (error instanceof Error && error.message === "author_support_proof_missing") {
    console.error("author_route_error", "author_support_proof_missing", 403);
    return jsonError("author_support_proof_missing", 403);
  }

  console.error("author_route_unhandled_error", error);
  return jsonError("internal_error", 500);
}
