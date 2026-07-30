import {
  DEFAULT_AUTHOR_PROJECT_LIMIT,
  PREMIUM_AUTHOR_PROJECT_LIMIT,
} from "@/lib/author-projects/constants";

export type AuthorProjectLimitSource = "override" | "premium" | "default";

export type AuthorProjectLimitResolution = {
  limit: number;
  source: AuthorProjectLimitSource;
  premiumEnabled: boolean;
  hasOverride: boolean;
};

/**
 * effective_project_limit = admin_override ?? premium_plan_limit ?? 1
 */
export function resolveEffectiveAuthorProjectLimit(input: {
  override: number | null | undefined;
  premiumEnabled: boolean | null | undefined;
}): AuthorProjectLimitResolution {
  const override =
    typeof input.override === "number" &&
    Number.isFinite(input.override) &&
    input.override >= 1
      ? Math.floor(input.override)
      : null;
  const premiumEnabled = input.premiumEnabled === true;

  if (override != null) {
    return {
      limit: override,
      source: "override",
      premiumEnabled,
      hasOverride: true,
    };
  }

  if (premiumEnabled) {
    return {
      limit: PREMIUM_AUTHOR_PROJECT_LIMIT,
      source: "premium",
      premiumEnabled,
      hasOverride: false,
    };
  }

  return {
    limit: DEFAULT_AUTHOR_PROJECT_LIMIT,
    source: "default",
    premiumEnabled,
    hasOverride: false,
  };
}

export function canCreateOwnedAuthorProject(used: number, limit: number): boolean {
  return used < limit && limit >= 1;
}

/**
 * Premium upsell for basic accounts at their single-project limit.
 * Hidden while an admin override still has free slots (e.g. Sergey 3/5).
 */
export function shouldShowPremiumProjectUpsell(input: {
  used: number;
  limit: number;
  source: AuthorProjectLimitSource;
}): boolean {
  if (canCreateOwnedAuthorProject(input.used, input.limit)) {
    return false;
  }

  return input.source === "default" && input.limit === DEFAULT_AUTHOR_PROJECT_LIMIT;
}

export function getAuthorProjectLimitReachedMessage(input: {
  used: number;
  limit: number;
  source: AuthorProjectLimitSource;
}): string {
  if (shouldShowPremiumProjectUpsell(input)) {
    return [
      "В базовом кабинете доступен один авторский проект.",
      "В Premium можно создать до трёх проектов и управлять ими из одного аккаунта.",
    ].join("\n");
  }

  return `Лимит проектов исчерпан: ${input.used} из ${input.limit}.`;
}
