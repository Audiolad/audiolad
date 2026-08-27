import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OrdinaryCatalogViewer = {
  userId: string | null;
  allowlistedPracticeIds: string[];
  entitledPracticeIds: string[];
  hiddenPracticeIds: string[];
};

export const GUEST_ORDINARY_CATALOG_VIEWER: OrdinaryCatalogViewer = {
  userId: null,
  allowlistedPracticeIds: [],
  entitledPracticeIds: [],
  hiddenPracticeIds: [],
};

export class OrdinaryCatalogViewerLoadError extends Error {
  constructor(message = "catalog_viewer_state_unavailable") {
    super(message);
    this.name = "OrdinaryCatalogViewerLoadError";
  }
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function uniqueUuids(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(isUuid))];
}

export function postgrestInList(ids: readonly string[]): string {
  return `(${uniqueUuids(ids).join(",")})`;
}

/**
 * Load the viewer context for ordinary catalog /api/catalog / catalog search.
 *
 * Hidden = active entitlement OR library save. Those stay two entities;
 * both drop the card from ordinary catalog only.
 */
export async function loadOrdinaryCatalogViewer(
  supabase: SupabaseClient,
  userId?: string | null,
): Promise<OrdinaryCatalogViewer> {
  if (!userId || !isUuid(userId)) {
    return GUEST_ORDINARY_CATALOG_VIEWER;
  }

  const [allowlistResult, entitlementResult, savesResult] = await Promise.all([
    supabase
      .from("practice_visibility_users")
      .select("practice_id")
      .eq("user_id", userId),
    supabase
      .from("user_practices")
      .select("practice_id, expires_at")
      .eq("user_id", userId),
    supabase.from("library_saves").select("practice_id").eq("user_id", userId),
  ]);

  if (allowlistResult.error || entitlementResult.error || savesResult.error) {
    throw new OrdinaryCatalogViewerLoadError(
      allowlistResult.error?.message ??
        entitlementResult.error?.message ??
        savesResult.error?.message ??
        "catalog_viewer_state_unavailable",
    );
  }

  const allowlistedPracticeIds = uniqueUuids(
    (allowlistResult.data ?? []).map((row) => String(row.practice_id ?? "")),
  );

  const now = Date.now();
  const entitledIds = (entitlementResult.data ?? [])
    .filter((row) => {
      if (row.expires_at == null) {
        return true;
      }
      const expires = Date.parse(String(row.expires_at));
      return Number.isFinite(expires) && expires > now;
    })
    .map((row) => String(row.practice_id ?? ""));

  const savedIds = (savesResult.data ?? []).map((row) =>
    String(row.practice_id ?? ""),
  );

  const entitledPracticeIds = uniqueUuids(entitledIds);

  return {
    userId,
    allowlistedPracticeIds,
    entitledPracticeIds,
    hiddenPracticeIds: uniqueUuids([...entitledPracticeIds, ...savedIds]),
  };
}

export async function resolveCatalogViewerUserId(
  supabase: SupabaseClient,
  explicitUserId?: string | null,
): Promise<string | null> {
  if (explicitUserId !== undefined) {
    return explicitUserId;
  }

  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Server-side ordinary catalog eligibility:
 * - guest: listed only
 * - authenticated: listed PLUS selected_users on the allowlist
 * - unlisted never
 * - drop granted / saved products
 *
 * Public showcases (home, sitemap, editorial) should keep listed-only
 * by passing the guest viewer (default).
 */
export function applyOrdinaryCatalogEligibility<T>(
  query: T,
  viewer: OrdinaryCatalogViewer = GUEST_ORDINARY_CATALOG_VIEWER,
): T {
  const allowlisted = uniqueUuids(viewer.allowlistedPracticeIds);
  const hidden = uniqueUuids(viewer.hiddenPracticeIds);
  const q = query as {
    eq: (column: string, value: string | boolean) => unknown;
    or: (filters: string) => unknown;
    not: (column: string, operator: string, value: string) => unknown;
  };

  let next = q.eq("status", "published") as typeof q;

  if (allowlisted.length === 0) {
    next = next.eq("catalog_visibility", "listed") as typeof q;
  } else {
    next = next.or(
      `catalog_visibility.eq.listed,and(catalog_visibility.eq.selected_users,id.in.${postgrestInList(allowlisted)})`,
    ) as typeof q;
  }

  if (hidden.length > 0) {
    next = next.not("id", "in", postgrestInList(hidden)) as typeof q;
  }

  return next as T;
}
