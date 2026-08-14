/**
 * Platform team permission codes and role bundles.
 * Author workspace roles (author_members) are a separate system.
 */

export const PLATFORM_PERMISSIONS = [
  "admin_panel.access",
  "dashboard.view",
  "authors.view",
  "authors.manage",
  "authors.payout_profiles.review",
  "products.view",
  "products.moderate",
  "playlists.manage",
  "playlists.create_editorial",
  "author_products.moderate",
  "users.view",
  "users.manage",
  "analytics.view",
  "finance.view",
  "finance.terms.manage",
  "finance.ledger.manage",
  "finance.adjustments.manage",
  "finance.payouts.view",
  "finance.payouts.create",
  "finance.payouts.approve",
  "finance.payouts.mark_paid",
  "finance.payouts.reverse",
  "finance.payouts.manage",
  "payouts.manage",
  "refunds.manage",
  "team.view",
  "team.manage",
  "settings.manage",
  "audit_log.view",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_TEAM_ROLES = [
  "owner",
  "admin",
  "editor",
  "support",
  "analyst",
  "finance",
] as const;

export type PlatformTeamRole = (typeof PLATFORM_TEAM_ROLES)[number];

/** Default permission bundles. Owner also bypasses at runtime for future codes. */
export const PLATFORM_ROLE_PERMISSIONS: Record<
  PlatformTeamRole,
  readonly PlatformPermission[]
> = {
  owner: PLATFORM_PERMISSIONS,
  admin: [
    "admin_panel.access",
    "dashboard.view",
    "authors.view",
    "authors.manage",
    "products.view",
    "products.moderate",
    "playlists.manage",
    "playlists.create_editorial",
    "author_products.moderate",
    "users.view",
    "users.manage",
    "analytics.view",
    "team.view",
    "settings.manage",
    "audit_log.view",
  ],
  editor: [
    "admin_panel.access",
    "dashboard.view",
    "authors.view",
    "products.view",
    "products.moderate",
    "playlists.create_editorial",
  ],
  support: ["admin_panel.access", "authors.view", "users.view"],
  analyst: ["admin_panel.access", "dashboard.view", "analytics.view"],
  finance: [
    "admin_panel.access",
    "finance.view",
    "finance.terms.manage",
    "finance.ledger.manage",
    "finance.adjustments.manage",
    "finance.payouts.view",
    "finance.payouts.create",
    "finance.payouts.approve",
    "finance.payouts.mark_paid",
    "finance.payouts.reverse",
    "finance.payouts.manage",
    "payouts.manage",
    "refunds.manage",
  ],
};

export function isPlatformPermission(
  value: string | null | undefined,
): value is PlatformPermission {
  return (
    typeof value === "string" &&
    (PLATFORM_PERMISSIONS as readonly string[]).includes(value)
  );
}

export function isPlatformTeamRole(
  value: string | null | undefined,
): value is PlatformTeamRole {
  return (
    typeof value === "string" &&
    (PLATFORM_TEAM_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Pure resolver used by unit tests and as a fallback when DB RPC is unavailable.
 * Owner role grants every known permission (and callers treat unknown codes as allowed for owner).
 */
export function resolvePermissionsForRoles(
  roles: readonly string[],
  options?: { includeUnknownForOwner?: boolean; permission?: string },
): Set<string> {
  const normalized = roles.filter(isPlatformTeamRole);
  const permissions = new Set<string>();

  if (normalized.includes("owner")) {
    for (const code of PLATFORM_PERMISSIONS) {
      permissions.add(code);
    }
    if (options?.includeUnknownForOwner && options.permission) {
      permissions.add(options.permission);
    }
    return permissions;
  }

  for (const role of normalized) {
    for (const code of PLATFORM_ROLE_PERMISSIONS[role]) {
      permissions.add(code);
    }
  }

  return permissions;
}

export function rolesGrantPermission(
  roles: readonly string[],
  permission: string,
): boolean {
  if (roles.some((role) => role === "owner")) {
    return true;
  }

  return resolvePermissionsForRoles(roles).has(permission);
}

/** Temporary legacy mapping — keep centralized; do not spread profiles.role checks. */
export function legacyProfileRoleToTeamRoles(
  legacyRole: string | null | undefined,
): PlatformTeamRole[] {
  if (legacyRole === "platform_owner") {
    return ["owner"];
  }
  if (legacyRole === "platform_admin") {
    return ["admin"];
  }
  return [];
}
