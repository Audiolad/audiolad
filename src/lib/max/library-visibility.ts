/**
 * Saved-only metadata for the MAX library.
 *
 * The Stage-1 loader uses the service role, which bypasses practices RLS.
 * Reveal rules match the ordinary product page: a save is not visibility,
 * and an active entitlement is not a catalog listing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LibraryCollectionItem } from "@/lib/library/collection";
import {
  canEntitledUserAccessPracticeStatus,
} from "@/lib/products/access";
import { canRevealPublicProductPage } from "@/lib/products/publish-preview";

type VisibilityRow = {
  id: string;
  status: string | null;
  deleted_at: string | null;
  catalog_visibility: string | null;
  is_catalog_listed: boolean | null;
  scheduled_publish_at: string | null;
  published_at: string | null;
  author_id: string | null;
};

function asVisibilityRow(value: unknown): VisibilityRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Partial<VisibilityRow>;
  if (typeof row.id !== "string" || !row.id) {
    return null;
  }

  return {
    id: row.id,
    status: typeof row.status === "string" ? row.status : null,
    deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
    catalog_visibility:
      typeof row.catalog_visibility === "string" ? row.catalog_visibility : null,
    is_catalog_listed:
      typeof row.is_catalog_listed === "boolean" ? row.is_catalog_listed : null,
    scheduled_publish_at:
      typeof row.scheduled_publish_at === "string" ? row.scheduled_publish_at : null,
    published_at: typeof row.published_at === "string" ? row.published_at : null,
    author_id: typeof row.author_id === "string" ? row.author_id : null,
  };
}

function unavailableItem(item: LibraryCollectionItem): LibraryCollectionItem {
  return {
    ...item,
    canListen: false,
    accessSource: null,
    practice: null,
  };
}

async function linkedUserIsPlatformAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (typeof (supabase as { rpc?: unknown }).rpc !== "function") {
    return false;
  }

  try {
    const { data, error } = await supabase.rpc("has_platform_permission", {
      p_user_id: userId,
      p_permission_code: "admin_panel.access",
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function redactMaxLibraryCatalogVisibility(
  supabase: SupabaseClient,
  userId: string,
  items: LibraryCollectionItem[],
): Promise<{ items: LibraryCollectionItem[]; error: boolean }> {
  const practiceIds = [...new Set(items.map((item) => item.practiceId).filter(Boolean))];
  if (practiceIds.length === 0) {
    return { items, error: false };
  }

  const [practiceResult, allowlistResult, membershipResult, isPlatformAdmin] =
    await Promise.all([
      supabase
        .from("practices")
        .select(
          "id, status, deleted_at, catalog_visibility, is_catalog_listed, scheduled_publish_at, published_at, author_id",
        )
        .in("id", practiceIds),
      supabase
        .from("practice_visibility_users")
        .select("practice_id")
        .eq("user_id", userId)
        .in("practice_id", practiceIds),
      supabase.from("author_members").select("author_id").eq("user_id", userId),
      linkedUserIsPlatformAdmin(supabase, userId),
    ]);

  if (practiceResult.error || allowlistResult.error || membershipResult.error) {
    return { items: [], error: true };
  }

  const practices = new Map<string, VisibilityRow>();
  for (const raw of practiceResult.data ?? []) {
    const row = asVisibilityRow(raw);
    if (row) {
      practices.set(row.id, row);
    }
  }

  const allowlisted = new Set(
    (allowlistResult.data ?? [])
      .map((row) => (typeof row.practice_id === "string" ? row.practice_id : ""))
      .filter(Boolean),
  );
  const authorIds = new Set(
    (membershipResult.data ?? [])
      .map((row) => (typeof row.author_id === "string" ? row.author_id : ""))
      .filter(Boolean),
  );

  return {
    error: false,
    items: items.map((item) => {
      const row = practices.get(item.practiceId) ?? null;
      if (!row || row.deleted_at || !item.practice) {
        return unavailableItem(item);
      }

      const hasEntitlement = item.canListen;
      const isAuthorMember = Boolean(row.author_id && authorIds.has(row.author_id));
      const reveal = canRevealPublicProductPage({
        practiceStatus: row.status,
        catalogVisibility: row.catalog_visibility,
        isCatalogListed: row.is_catalog_listed,
        scheduledPublishAt: row.scheduled_publish_at,
        publishedAt: row.published_at,
        access: {
          isAuthorMember,
          hasEntitlement,
          canSeeSelectedUsers:
            allowlisted.has(row.id) || isAuthorMember || isPlatformAdmin || hasEntitlement,
        },
      });

      if (!reveal) {
        return unavailableItem(item);
      }

      const canListen =
        hasEntitlement && canEntitledUserAccessPracticeStatus(row.status);

      return {
        ...item,
        canListen,
        accessSource: canListen ? item.accessSource : null,
      };
    }),
  };
}
