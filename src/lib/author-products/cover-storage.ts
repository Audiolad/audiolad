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
 * Use this client only after the route has authorised the actor
 * (requirePracticeMutationAccess) and resolved the practice / audio item ids
 * from the database. Never pass it paths taken from the request body.
 */
export const PRACTICE_COVERS_BUCKET = "practice-covers";

export type CoverStorageClient = Pick<SupabaseClient, "storage">;

export function createPracticeCoverStorageClient(): CoverStorageClient {
  return createServiceRoleClient();
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
