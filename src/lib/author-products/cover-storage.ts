import type { SupabaseClient } from "@supabase/supabase-js";

import { listManifestStoragePaths } from "@/lib/images/image-manifest";
import type { ImageManifest } from "@/lib/images/image-types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Product and track cover objects in the `practice-covers` bucket are written
 * only by the server (migration 20270117120000): the `authenticated` role can
 * no longer insert, update or delete them, so the 1:1 check in the cover
 * routes cannot be bypassed through the Storage API.
 *
 * Since migration 20270118120000 the same applies to the database columns
 * that point at these images (practices.cover_url / cover_image,
 * audio_items.cover_url / cover_image, publication_gallery_slides image
 * columns) and to gallery uploads: only the server writes them.
 *
 * Use this client only after the route has authorised the actor
 * (requirePracticeMutationAccess) and resolved the practice / audio item ids
 * from the database. Never pass it paths taken from the request body.
 */
export const PRACTICE_COVERS_BUCKET = "practice-covers";

export type CoverStorageClient = Pick<SupabaseClient, "storage">;

export function createPracticeCoverStorageClient(): CoverStorageClient {
  return createServiceRoleClient();
}

/**
 * Server client for cover / gallery image rows and objects. Same rules as
 * createPracticeCoverStorageClient: only after access checks, only with ids
 * resolved by the route.
 */
export function createPracticeImageWriteClient(): SupabaseClient {
  return createServiceRoleClient();
}

export type CoverColumnsPatch = {
  cover_url: string | null;
  cover_image: unknown;
  updated_at: string;
};

type CoverWriteResult = { ok: true } | { ok: false; error: string };

/** Sets practices.cover_url / cover_image. Server path only. */
export async function writePracticeCoverColumns(
  client: Pick<SupabaseClient, "from">,
  practiceId: string,
  patch: CoverColumnsPatch,
): Promise<CoverWriteResult> {
  const { data, error } = await client
    .from("practices")
    .update(patch)
    .eq("id", practiceId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  return data ? { ok: true } : { ok: false, error: "practice_not_found" };
}

/** Sets audio_items.cover_url / cover_image for one track of a practice. */
export async function writeTrackCoverColumns(
  client: Pick<SupabaseClient, "from">,
  practiceId: string,
  audioItemId: string,
  patch: CoverColumnsPatch,
): Promise<CoverWriteResult> {
  const { data, error } = await client
    .from("audio_items")
    .update(patch)
    .eq("id", audioItemId)
    .eq("practice_id", practiceId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  return data ? { ok: true } : { ok: false, error: "audio_item_not_found" };
}

const GALLERY_SLIDE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Slide ids are server-generated UUIDs; anything else never reaches Storage. */
export function isGallerySlideId(value: unknown): value is string {
  return typeof value === "string" && GALLERY_SLIDE_ID_RE.test(value);
}

export function gallerySlidePrefix(practiceId: string, slideId: string): string {
  return `practices/${practiceId}/gallery/${slideId}/`;
}

export function productCoverVariantPrefix(practiceId: string): string {
  return `practices/${practiceId}/variants/`;
}

export function trackCoverVariantPrefix(
  practiceId: string,
  audioItemId: string,
): string {
  return `practices/${practiceId}/track-covers/${audioItemId}/variants/`;
}

function isSafeObjectPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("..") &&
    !path.includes("//") &&
    !path.includes("\\") &&
    !/[\u0000-\u001f]/.test(path)
  );
}

/**
 * Keeps only object paths that belong to the given cover prefix. Manifests
 * are stored in rows the author can edit, so a privileged cleanup must never
 * trust them to point at the author's own cover.
 */
export function filterCoverPathsToPrefix(
  paths: readonly string[],
  prefix: string,
): string[] {
  if (!isSafeObjectPath(prefix) || !prefix.endsWith("/")) {
    return [];
  }

  return [
    ...new Set(
      paths
        .map((path) => path.trim())
        .filter(
          (path) =>
            isSafeObjectPath(path) &&
            path.startsWith(prefix) &&
            path.length > prefix.length,
        ),
    ),
  ];
}

/** Removes the files of a cover manifest, limited to `prefix`. Best effort. */
export async function cleanupCoverManifestWithinPrefix(
  client: CoverStorageClient,
  manifest: ImageManifest | null | undefined,
  prefix: string,
): Promise<void> {
  if (!manifest) {
    return;
  }

  const all = listManifestStoragePaths(manifest);
  const scoped = filterCoverPathsToPrefix(all, prefix);

  if (scoped.length < all.length) {
    console.warn("cover_manifest_cleanup_paths_skipped", {
      skipped: all.length - scoped.length,
    });
  }

  if (scoped.length === 0) {
    return;
  }

  await client.storage
    .from(PRACTICE_COVERS_BUCKET)
    .remove(scoped)
    .catch(() => undefined);
}
