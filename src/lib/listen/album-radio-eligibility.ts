import type { SupabaseClient } from "@supabase/supabase-js";
import { isPracticeCatalogListed } from "@/lib/products/access";
import type { ListenAccessMode } from "@/lib/listen/types";

export type AlbumRadioReleaseRow = {
  id: string;
  product_kind?: string | null;
  publication_class?: string | null;
  deleted_at?: string | null;
  status: string | null | undefined;
  is_catalog_listed?: boolean | null;
  catalog_visibility?: string | null;
  scheduled_publish_at?: string | null;
  published_at?: string | null;
};

/** Published, catalog-listed music release of the ordinary consumer catalog. */
export function isAlbumRadioReleaseRow(row: AlbumRadioReleaseRow): boolean {
  return row.product_kind === "music" &&
    (row.publication_class == null || row.publication_class === "release") &&
    !row.deleted_at && isPracticeCatalogListed(row);
}

/**
 * Server-validated radio eligibility shared by every listen session builder
 * (/api listen payload and the direct /listen page).
 *
 * An author member listens with author_preview access, which also returns draft
 * audio_items. Their album joins radio only when it is a listed release AND none of
 * its audio_items is unpublished, so radio never carries a draft track (t1437u).
 */
export async function resolveAlbumRadioEligible(
  supabase: SupabaseClient,
  row: AlbumRadioReleaseRow,
  accessMode: ListenAccessMode,
): Promise<boolean> {
  if (!isAlbumRadioReleaseRow(row)) return false;
  if (accessMode !== "author_preview") return true;
  try {
    const { count, error } = await supabase.from("audio_items")
      .select("id", { count: "exact", head: true })
      .eq("practice_id", row.id)
      .neq("status", "published");
    return !error && count === 0;
  } catch {
    return false;
  }
}
