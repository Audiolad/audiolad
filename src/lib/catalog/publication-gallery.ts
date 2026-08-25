import type { SupabaseClient } from "@supabase/supabase-js";

import type { CatalogSlide } from "@/lib/catalog/dto";
import {
  CATALOG_GALLERY_MAX_SLIDES,
  normalizeCatalogGallery,
} from "@/lib/catalog/gallery";

export const PUBLICATION_GALLERY_TABLE = "publication_gallery_slides";

export type PublicationGallerySlideRow = {
  id: string;
  publication_id: string;
  image_url: string;
  image_manifest?: unknown;
  position: number;
  alt: string | null;
  created_at?: string;
  updated_at?: string;
};

export function mapPublicationGalleryRowsToCatalogSlides(
  rows: ReadonlyArray<Partial<PublicationGallerySlideRow> | null | undefined>,
): CatalogSlide[] {
  return normalizeCatalogGallery(
    rows.map((row) => ({
      id: row?.id,
      image_url: row?.image_url,
      position: row?.position,
      alt: row?.alt ?? "",
    })),
  );
}

export function groupPublicationGalleryRowsByPublicationId(
  rows: ReadonlyArray<PublicationGallerySlideRow>,
): Map<string, CatalogSlide[]> {
  const grouped = new Map<string, PublicationGallerySlideRow[]>();

  for (const row of rows) {
    const publicationId = row.publication_id?.trim();

    if (!publicationId) {
      continue;
    }

    const current = grouped.get(publicationId) ?? [];
    current.push(row);
    grouped.set(publicationId, current);
  }

  const result = new Map<string, CatalogSlide[]>();

  for (const [publicationId, publicationRows] of grouped) {
    result.set(
      publicationId,
      mapPublicationGalleryRowsToCatalogSlides(publicationRows),
    );
  }

  return result;
}

export async function loadPublicationGalleriesByIds(
  supabase: SupabaseClient,
  publicationIds: readonly string[],
): Promise<Map<string, CatalogSlide[]>> {
  const ids = [...new Set(publicationIds.map((id) => id.trim()).filter(Boolean))];

  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from(PUBLICATION_GALLERY_TABLE)
    .select("id, publication_id, image_url, position, alt")
    .in("publication_id", ids)
    .order("position", { ascending: true })
    .order("id", { ascending: true })
    .limit(ids.length * CATALOG_GALLERY_MAX_SLIDES);

  if (error) {
    console.error("publication_gallery_load_error", error.message);
    return new Map();
  }

  return groupPublicationGalleryRowsByPublicationId(
    (data ?? []) as PublicationGallerySlideRow[],
  );
}
