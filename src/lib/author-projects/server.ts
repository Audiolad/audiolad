import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AuthorAccessError,
  listAuthorWorkspacesForUser,
} from "@/lib/author-products/auth";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import {
  canCreateOwnedAuthorProject,
  getAuthorProjectLimitReachedMessage,
  resolveEffectiveAuthorProjectLimit,
  shouldShowPremiumProjectUpsell,
  type AuthorProjectLimitResolution,
} from "@/lib/author-projects/limits";

export type AuthorProjectsSummary = {
  projects: AuthorWorkspace[];
  ownedCount: number;
  limit: number;
  source: AuthorProjectLimitResolution["source"];
  premiumEnabled: boolean;
  hasOverride: boolean;
  canCreate: boolean;
  showPremiumUpsell: boolean;
  limitMessage: string | null;
};

export async function loadAuthorProjectLimitFields(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  override: number | null;
  premiumEnabled: boolean;
}> {
  const { data, error } = await supabase
    .from("profiles")
    .select("author_project_limit_override, author_premium_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("author_project_limit_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  const overrideRaw = data?.author_project_limit_override;
  const override =
    typeof overrideRaw === "number" && Number.isFinite(overrideRaw)
      ? overrideRaw
      : null;

  return {
    override,
    premiumEnabled: data?.author_premium_enabled === true,
  };
}

export async function getAuthorProjectsSummary(
  userId: string,
  supabase: SupabaseClient,
): Promise<AuthorProjectsSummary> {
  const [projects, limitFields] = await Promise.all([
    listAuthorWorkspacesForUser(userId, supabase),
    loadAuthorProjectLimitFields(supabase, userId),
  ]);

  const ownedCount = projects.filter((project) => project.role === "owner").length;
  const resolution = resolveEffectiveAuthorProjectLimit(limitFields);
  const canCreate = canCreateOwnedAuthorProject(ownedCount, resolution.limit);
  const showPremiumUpsell = shouldShowPremiumProjectUpsell({
    used: ownedCount,
    limit: resolution.limit,
    source: resolution.source,
  });

  return {
    projects,
    ownedCount,
    limit: resolution.limit,
    source: resolution.source,
    premiumEnabled: resolution.premiumEnabled,
    hasOverride: resolution.hasOverride,
    canCreate,
    showPremiumUpsell,
    limitMessage: canCreate
      ? null
      : getAuthorProjectLimitReachedMessage({
          used: ownedCount,
          limit: resolution.limit,
          source: resolution.source,
        }),
  };
}

export type CreateAuthorProjectInput = {
  name: string;
  slug?: string | null;
  shortDescription?: string | null;
};

export type CreateAuthorProjectResult = {
  authorId: string;
  slug: string;
  name: string;
  used: number;
  limit: number;
};

export async function createAuthorProjectViaRpc(
  supabase: SupabaseClient,
  input: CreateAuthorProjectInput,
): Promise<CreateAuthorProjectResult> {
  const { data, error } = await supabase.rpc("create_author_project", {
    p_name: input.name,
    p_slug: input.slug?.trim() || null,
    p_short_description: input.shortDescription?.trim() || null,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("author_project_limit_reached")) {
      throw new AuthorAccessError("author_project_limit_reached", 403);
    }
    if (message.includes("project_slug_taken") || error.code === "23505") {
      throw new AuthorAccessError("project_slug_taken", 409);
    }
    if (message.includes("invalid_project_name")) {
      throw new AuthorAccessError("invalid_project_name", 400);
    }
    if (message.includes("invalid_project_slug")) {
      throw new AuthorAccessError("invalid_project_slug", 400);
    }
    if (message.includes("invalid_project_description")) {
      throw new AuthorAccessError("invalid_project_description", 400);
    }
    if (message.includes("unauthorized") || error.code === "42501") {
      throw new AuthorAccessError("unauthorized", 401);
    }

    console.error("create_author_project_rpc_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  const payload = data as {
    ok?: boolean;
    author_id?: string;
    slug?: string;
    name?: string;
    used?: number;
    limit?: number;
  } | null;

  if (
    !payload?.ok ||
    !payload.author_id ||
    !payload.slug ||
    !payload.name ||
    typeof payload.used !== "number" ||
    typeof payload.limit !== "number"
  ) {
    throw new AuthorAccessError("internal_error", 500);
  }

  return {
    authorId: payload.author_id,
    slug: payload.slug,
    name: payload.name,
    used: payload.used,
    limit: payload.limit,
  };
}
