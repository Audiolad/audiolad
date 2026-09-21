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
  shouldShowCapacityPurchaseOffer,
  type AuthorProjectLimitResolution,
} from "@/lib/author-projects/limits";

export type AuthorProjectsSummary = {
  projects: AuthorWorkspace[];
  ownedCount: number;
  limit: number | null;
  unlimited: boolean;
  source: AuthorProjectLimitResolution["source"];
  premiumEnabled: boolean;
  hasOverride: boolean;
  baseLimit: number;
  purchasedSlots: number;
  partnerBonusSlots: number;
  canCreate: boolean;
  showPremiumUpsell: boolean;
  showCapacityOffer: boolean;
  limitMessage: string | null;
};

export async function loadAuthorProjectLimitFields(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  override: number | null;
  unlimited: boolean;
  premiumEnabled: boolean;
  purchasedSlots: number;
  partnerBonusSlots: number;
}> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "author_project_limit_override, author_projects_unlimited, author_premium_enabled, author_project_slots_purchased, author_project_slots_partner_bonus",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Column may be missing before migration lands in a local DB; fall back.
    if (
      /author_project_slots_purchased/i.test(error.message) ||
      /author_project_slots_partner_bonus/i.test(error.message)
    ) {
      const legacy = await supabase
        .from("profiles")
        .select(
          "author_project_limit_override, author_projects_unlimited, author_premium_enabled, author_project_slots_purchased",
        )
        .eq("id", userId)
        .maybeSingle();
      if (legacy.error) {
        // Pre-bonus / pre-purchase schema fallback.
        const older = await supabase
          .from("profiles")
          .select(
            "author_project_limit_override, author_projects_unlimited, author_premium_enabled",
          )
          .eq("id", userId)
          .maybeSingle();
        if (older.error) {
          console.error("author_project_limit_lookup_error", older.error.message);
          throw new AuthorAccessError("internal_error", 500);
        }
        const overrideRaw = older.data?.author_project_limit_override;
        return {
          override:
            typeof overrideRaw === "number" && Number.isFinite(overrideRaw)
              ? overrideRaw
              : null,
          unlimited: older.data?.author_projects_unlimited === true,
          premiumEnabled: older.data?.author_premium_enabled === true,
          purchasedSlots: 0,
          partnerBonusSlots: 0,
        };
      }
      const overrideRaw = legacy.data?.author_project_limit_override;
      const purchasedRaw = legacy.data?.author_project_slots_purchased;
      const purchasedSlots =
        typeof purchasedRaw === "number" &&
        Number.isFinite(purchasedRaw) &&
        purchasedRaw > 0
          ? Math.floor(purchasedRaw)
          : 0;
      return {
        override:
          typeof overrideRaw === "number" && Number.isFinite(overrideRaw)
            ? overrideRaw
            : null,
        unlimited: legacy.data?.author_projects_unlimited === true,
        premiumEnabled: legacy.data?.author_premium_enabled === true,
        purchasedSlots,
        partnerBonusSlots: 0,
      };
    }
    console.error("author_project_limit_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  const overrideRaw = data?.author_project_limit_override;
  const override =
    typeof overrideRaw === "number" && Number.isFinite(overrideRaw)
      ? overrideRaw
      : null;
  const purchasedRaw = data?.author_project_slots_purchased;
  const purchasedSlots =
    typeof purchasedRaw === "number" &&
    Number.isFinite(purchasedRaw) &&
    purchasedRaw > 0
      ? Math.floor(purchasedRaw)
      : 0;
  const partnerBonusRaw = (data as { author_project_slots_partner_bonus?: number | null } | null)
    ?.author_project_slots_partner_bonus;
  const partnerBonusSlots =
    typeof partnerBonusRaw === "number" &&
    Number.isFinite(partnerBonusRaw) &&
    partnerBonusRaw > 0
      ? Math.min(1, Math.floor(partnerBonusRaw))
      : 0;

  return {
    override,
    unlimited: data?.author_projects_unlimited === true,
    premiumEnabled: data?.author_premium_enabled === true,
    purchasedSlots,
    partnerBonusSlots,
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
  const canCreate = canCreateOwnedAuthorProject(
    ownedCount,
    resolution.limit,
    resolution.unlimited,
  );
  const showCapacityOffer = shouldShowCapacityPurchaseOffer({
    used: ownedCount,
    limit: resolution.limit,
    unlimited: resolution.unlimited,
  });

  return {
    projects,
    ownedCount,
    limit: resolution.limit,
    unlimited: resolution.unlimited,
    source: resolution.source,
    premiumEnabled: resolution.premiumEnabled,
    hasOverride: resolution.hasOverride,
    baseLimit: resolution.baseLimit,
    purchasedSlots: resolution.purchasedSlots,
    partnerBonusSlots: resolution.partnerBonusSlots,
    canCreate,
    showPremiumUpsell: showCapacityOffer,
    showCapacityOffer,
    limitMessage: canCreate
      ? null
      : getAuthorProjectLimitReachedMessage({
          used: ownedCount,
          limit: resolution.limit,
          unlimited: resolution.unlimited,
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
  limit: number | null;
  unlimited: boolean;
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
    limit?: number | null;
    unlimited?: boolean;
  } | null;

  if (
    !payload?.ok ||
    !payload.author_id ||
    !payload.slug ||
    !payload.name ||
    typeof payload.used !== "number" ||
    (payload.limit !== null && typeof payload.limit !== "number") ||
    typeof payload.unlimited !== "boolean"
  ) {
    throw new AuthorAccessError("internal_error", 500);
  }

  return {
    authorId: payload.author_id,
    slug: payload.slug,
    name: payload.name,
    used: payload.used,
    limit: payload.limit ?? null,
    unlimited: payload.unlimited,
  };
}
