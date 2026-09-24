import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildPreviewClipFromStorageSource } from "@/lib/listen/serve-preview-clip";
import type { PublicPracticeRow } from "@/lib/products/lookup";
import {
  resolveMaxPreviewStorageSource,
  resolveMaxStorefrontPreview,
  type MaxStorefrontPreviewDeps,
} from "@/lib/max/storefront-preview";

export type BuildMaxPreviewClipResult =
  | { ok: true; bytes: Uint8Array; startMs: number; endMs: number }
  | {
      ok: false;
      reason:
        | "preview_unavailable"
        | "forbidden"
        | "storage_unavailable";
    };

export async function buildMaxStorefrontPreviewClip(input: {
  supabase: SupabaseClient;
  practice: PublicPracticeRow;
  trackId: string;
  preview?: MaxStorefrontPreviewDeps;
}): Promise<BuildMaxPreviewClipResult> {
  try {
    const preview = await resolveMaxStorefrontPreview(
      input.practice,
      input.supabase,
      input.preview,
    );
    if (!preview.ok) {
      return preview;
    }
    if (preview.track.trackId !== input.trackId.trim()) {
      return { ok: false, reason: "forbidden" };
    }

    const source = await resolveMaxPreviewStorageSource({
      practice: input.practice,
      audioItem: preview.audioItem,
      loadActiveStream: input.preview?.loadActiveStream,
    });
    if (!source.ok) {
      return source;
    }

    const bytes = await buildPreviewClipFromStorageSource({
      storageClient: input.supabase,
      bucket: source.bucket,
      path: source.path,
      startMs: preview.window.startMs,
      endMs: preview.window.endMs,
      cacheKey: `max:${input.practice.id}:${preview.track.trackId}:${source.bucket}:${source.path}:${preview.window.startMs}:${preview.window.endMs}`,
    });

    return {
      ok: true,
      bytes,
      startMs: preview.window.startMs,
      endMs: preview.window.endMs,
    };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}
