import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  BUSINESS_PRIVATE_COVERS_BUCKET,
  BUSINESS_PRIVATE_COVER_SIGNED_URL_TTL_SECONDS,
  businessPrivateAlbumCoverPrefix,
  businessPrivateCoverRef,
  businessPrivateTrackCoverPrefix,
  parseBusinessPrivateCoverRef,
} from "@/lib/business-covers/private-cover";
import { uploadOptimizedImageSet } from "@/lib/images/image-upload-service";
import { listManifestStoragePaths } from "@/lib/images/image-manifest";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";

type StorageOwner = Pick<SupabaseClient, "storage">;

function coverContentType(path: string, declared: string | null | undefined): string {
  if (declared && declared !== "application/octet-stream") return declared;
  if (/\.webp$/i.test(path)) return "image/webp";
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  return "application/octet-stream";
}

/**
 * Uploads a business-only cover into the PRIVATE bucket (service role only).
 * Nothing is written to the public practice-covers bucket.
 */
export async function storeBusinessPrivateCover(input: {
  writer: StorageOwner;
  practiceId: string;
  audioItemId?: string | null;
  buffer: Buffer;
  declaredMime: string | null | undefined;
}): Promise<{ ok: true; ref: string; paths: string[] } | { ok: false; code: string }> {
  const uploaded = await uploadOptimizedImageSet({
    profile: input.audioItemId ? "track-cover" : "product-cover",
    bucket: BUSINESS_PRIVATE_COVERS_BUCKET,
    buffer: input.buffer,
    declaredMime: input.declaredMime,
    storage: input.writer.storage,
    context: input.audioItemId
      ? { practiceId: input.practiceId, audioItemId: input.audioItemId }
      : { practiceId: input.practiceId },
  });
  if (!uploaded.ok) return uploaded;
  const paths = listManifestStoragePaths(uploaded.data.manifest);
  return { ok: true, ref: businessPrivateCoverRef(uploaded.data.primaryDisplayPath), paths };
}

/** Removes private cover versions of an album (or one track), except `keep`. Best effort. */
export async function removeBusinessPrivateCoverVersions(input: {
  writer: StorageOwner;
  practiceId: string;
  audioItemId?: string | null;
  keep?: readonly string[];
}): Promise<void> {
  const prefix = input.audioItemId
    ? businessPrivateTrackCoverPrefix(input.practiceId, input.audioItemId)
    : businessPrivateAlbumCoverPrefix(input.practiceId);
  const keep = new Set(input.keep ?? []);
  const bucket = input.writer.storage.from(BUSINESS_PRIVATE_COVERS_BUCKET);
  try {
    const versions = await bucket.list(prefix, { limit: 1000 });
    const remove: string[] = [];
    for (const version of versions.data ?? []) {
      if (!version?.name) continue;
      const files = await bucket.list(`${prefix}/${version.name}`, { limit: 1000 });
      for (const file of files.data ?? []) {
        const path = `${prefix}/${version.name}/${file.name}`;
        if (file?.name && !keep.has(path)) remove.push(path);
      }
    }
    if (remove.length > 0) await bucket.remove(remove);
  } catch (error) {
    console.error("business_private_cover_cleanup_error", error instanceof Error ? error.message : error);
  }
}

/**
 * Short-lived signed URL for a private cover reference. Callers must already have
 * authorised the session (hall/owner workspace or album editor).
 */
export async function signBusinessPrivateCover(
  storage: StorageOwner,
  coverRef: string | null | undefined,
  expected: { practiceId: string; audioItemId?: string | null },
): Promise<string | null> {
  const parsed = parseBusinessPrivateCoverRef(coverRef);
  if (!parsed || parsed.practiceId !== expected.practiceId.toLowerCase()) return null;
  if ((parsed.audioItemId ?? null) !== (expected.audioItemId?.toLowerCase() ?? null)) return null;
  const { data, error } = await storage.storage
    .from(BUSINESS_PRIVATE_COVERS_BUCKET)
    .createSignedUrl(parsed.path, BUSINESS_PRIVATE_COVER_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return normalizeStorageSignedUrl(data.signedUrl);
}

/**
 * Private cover bytes for the hall/owner player. Callers must already have
 * authorised the session. Streams the file so playback does not depend on a
 * short-lived signed URL.
 */
export async function readBusinessPrivateCover(
  storage: StorageOwner,
  coverRef: string | null | undefined,
  expected: { practiceId: string; audioItemId?: string | null },
  options?: { variant?: "sm" },
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const parsed = parseBusinessPrivateCoverRef(coverRef);
  if (!parsed || parsed.practiceId !== expected.practiceId.toLowerCase()) return null;
  if ((parsed.audioItemId ?? null) !== (expected.audioItemId?.toLowerCase() ?? null)) return null;
  const download = async (path: string) => {
    const { data, error } = await storage.storage.from(BUSINESS_PRIVATE_COVERS_BUCKET).download(path);
    if (error || !data) return null;
    const body = new Uint8Array(await data.arrayBuffer());
    if (body.byteLength === 0) return null;
    return { body, contentType: coverContentType(path, data.type) };
  };
  // t1677u: player thumbnails (46–80 px, MediaSession) get the 320 px sm.webp of the same
  // upload version (~26 KB) instead of the 1000 px lg.webp (~130 KB), like public covers.
  const small = options?.variant === "sm" ? businessPrivateCoverVariantPath(parsed.path, "sm") : null;
  if (small) {
    const file = await download(small);
    if (file) return file;
  }
  return download(parsed.path);
}

/**
 * Sibling variant of a stored cover in the same version folder:
 * practices/<id>/variants/<version>/lg.webp → …/<version>/sm.webp. Null for any other shape.
 */
export function businessPrivateCoverVariantPath(path: string, variant: "sm"): string | null {
  const match = /^(.*\/variants\/[A-Za-z0-9_-]+\/)(?:xl|lg|md|sm)\.webp$/.exec(path);
  return match ? `${match[1]}${variant}.webp` : null;
}
