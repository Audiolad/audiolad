import type { SupabaseClient } from "@supabase/supabase-js";

import { CATALOG_GALLERY_MAX_SLIDES } from "@/lib/catalog/gallery";
import {
  PUBLICATION_GALLERY_TABLE,
  type PublicationGallerySlideRow,
} from "@/lib/catalog/publication-gallery";
import {
  type AuthorGallerySlide,
  getAuthorGalleryErrorMessage,
} from "@/lib/author-products/gallery-shared";
import { cleanupImageManifest } from "@/lib/images/image-upload-service";
import { parseImageManifest } from "@/lib/images/image-manifest";

export const PRACTICE_COVERS_BUCKET = "practice-covers";

export type { AuthorGallerySlide };
export { getAuthorGalleryErrorMessage };

const AUTHOR_GALLERY_SELECT =
  "id, publication_id, image_url, image_manifest, position, alt, created_at";

function toAuthorSlide(row: PublicationGallerySlideRow): AuthorGallerySlide {
  return {
    id: row.id,
    publication_id: row.publication_id,
    image_url: row.image_url,
    image_manifest: row.image_manifest ?? null,
    position: row.position,
    alt: row.alt ?? null,
    created_at: row.created_at ?? "",
  };
}

export async function listAuthorGallerySlides(
  supabase: SupabaseClient,
  publicationId: string,
): Promise<AuthorGallerySlide[]> {
  const { data, error } = await supabase
    .from(PUBLICATION_GALLERY_TABLE)
    .select(AUTHOR_GALLERY_SELECT)
    .eq("publication_id", publicationId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error("gallery_lookup_failed");
  }

  return ((data ?? []) as PublicationGallerySlideRow[]).map(toAuthorSlide);
}

export async function countAuthorGallerySlides(
  supabase: SupabaseClient,
  publicationId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(PUBLICATION_GALLERY_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("publication_id", publicationId);

  if (error) {
    throw new Error("gallery_lookup_failed");
  }

  return count ?? 0;
}

export async function insertAuthorGallerySlide(
  supabase: SupabaseClient,
  input: {
    id: string;
    publicationId: string;
    imageUrl: string;
    imageManifest: unknown;
    alt?: string | null;
  },
): Promise<AuthorGallerySlide> {
  const existing = await listAuthorGallerySlides(supabase, input.publicationId);

  if (existing.length >= CATALOG_GALLERY_MAX_SLIDES) {
    throw new GalleryLimitError();
  }

  const nextPosition =
    existing.length === 0
      ? 0
      : Math.max(...existing.map((slide) => slide.position)) + 1;

  const { data, error } = await supabase
    .from(PUBLICATION_GALLERY_TABLE)
    .insert({
      id: input.id,
      publication_id: input.publicationId,
      image_url: input.imageUrl,
      image_manifest: input.imageManifest,
      position: nextPosition,
      alt: input.alt?.trim() || null,
    })
    .select(AUTHOR_GALLERY_SELECT)
    .single();

  if (error || !data) {
    if (error?.message?.includes("publication_gallery_slide_limit_exceeded")) {
      throw new GalleryLimitError();
    }

    console.error("author_gallery_insert_error", error?.message);
    throw new Error("gallery_insert_failed");
  }

  return toAuthorSlide(data as PublicationGallerySlideRow);
}

export async function reorderAuthorGallerySlides(
  supabase: SupabaseClient,
  publicationId: string,
  order: readonly string[],
): Promise<AuthorGallerySlide[]> {
  const existing = await listAuthorGallerySlides(supabase, publicationId);
  const existingIds = existing.map((slide) => slide.id);

  if (order.length !== existingIds.length) {
    throw new GalleryReorderError();
  }

  const uniqueOrder = new Set(order);

  if (uniqueOrder.size !== order.length) {
    throw new GalleryReorderError();
  }

  for (const id of order) {
    if (!existingIds.includes(id)) {
      throw new GalleryReorderError();
    }
  }

  for (const [index, id] of order.entries()) {
    const { error } = await supabase
      .from(PUBLICATION_GALLERY_TABLE)
      .update({ position: index })
      .eq("id", id)
      .eq("publication_id", publicationId);

    if (error) {
      console.error("author_gallery_reorder_error", error.message);
      throw new Error("gallery_reorder_failed");
    }
  }

  return listAuthorGallerySlides(supabase, publicationId);
}

export async function deleteAuthorGallerySlide(
  supabase: SupabaseClient,
  publicationId: string,
  slideId: string,
): Promise<AuthorGallerySlide[]> {
  const { data: existing, error: lookupError } = await supabase
    .from(PUBLICATION_GALLERY_TABLE)
    .select(AUTHOR_GALLERY_SELECT)
    .eq("id", slideId)
    .eq("publication_id", publicationId)
    .maybeSingle();

  if (lookupError) {
    throw new Error("gallery_lookup_failed");
  }

  if (!existing) {
    throw new GalleryNotFoundError();
  }

  const { error: deleteError } = await supabase
    .from(PUBLICATION_GALLERY_TABLE)
    .delete()
    .eq("id", slideId)
    .eq("publication_id", publicationId);

  if (deleteError) {
    console.error("author_gallery_delete_error", deleteError.message);
    throw new Error("gallery_delete_failed");
  }

  await cleanupImageManifest(
    supabase.storage,
    PRACTICE_COVERS_BUCKET,
    parseImageManifest(
      (existing as PublicationGallerySlideRow).image_manifest,
    ),
  );

  const remaining = await listAuthorGallerySlides(supabase, publicationId);
  const compactedIds = remaining.map((slide) => slide.id);

  if (compactedIds.length > 0) {
    return reorderAuthorGallerySlides(supabase, publicationId, compactedIds);
  }

  return remaining;
}

export class GalleryLimitError extends Error {
  code = "gallery_limit_exceeded";
  status = 400;

  constructor() {
    super("gallery_limit_exceeded");
  }
}

export class GalleryReorderError extends Error {
  code = "invalid_request";
  status = 400;

  constructor() {
    super("invalid_request");
  }
}

export class GalleryNotFoundError extends Error {
  code = "not_found";
  status = 404;

  constructor() {
    super("not_found");
  }
}

export function isGalleryLimitError(
  error: unknown,
): error is GalleryLimitError {
  return error instanceof GalleryLimitError;
}

export function isGalleryReorderError(
  error: unknown,
): error is GalleryReorderError {
  return error instanceof GalleryReorderError;
}

export function isGalleryNotFoundError(
  error: unknown,
): error is GalleryNotFoundError {
  return error instanceof GalleryNotFoundError;
}
