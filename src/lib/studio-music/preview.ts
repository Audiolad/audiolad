import { isFixtureMarkedPractice } from "@/lib/fixtures/test-fixture-marker";
import { BUSINESS_ONLY_COLUMN } from "@/lib/products/business-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildPracticePreviewClip,
  type PreviewAudioItemRow,
} from "@/lib/listen/serve-preview-clip";
import {
  resolveMusicCatalogPreviewMode,
  resolveMusicListenSource,
  type MusicStreamCandidate,
} from "@/lib/listen/music-delivery";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";

import { canUseMusicInStudio } from "./access";
import {
  isFreePublicStudioMusicInventory,
  isPublicStudioMusicInventory,
  isStudioMusicCatalogUuid,
  type StudioMusicCatalogEntitlement,
  type StudioMusicCatalogPublication,
} from "./catalog";

export type StudioMusicPreviewAudioItem = PreviewAudioItemRow & {
  practice_id?: string | null;
  /**
   * Server-only: the track's active music-streams delivery asset, when any.
   * Album tracks uploaded through the music pipeline often have no legacy
   * audio_path and are playable only through this asset.
   */
  active_stream?: MusicStreamCandidate | null;
};

export type StudioMusicPreviewSource = { bucket: string; path: string };

/**
 * Pick the storage object the Studio catalog may serve for a track.
 * Full listening follows the public listen rule (verified stream first,
 * then legacy audio_path); a short clip prefers the legacy original and
 * falls back to the verified stream, like the public catalog preview.
 */
export function resolveStudioMusicPreviewSource(input: {
  productKind: string | null | undefined;
  audioItem: StudioMusicPreviewAudioItem;
  access: "preview" | "full";
}): StudioMusicPreviewSource | null {
  const args = {
    productKind: input.productKind ?? "",
    audioItemId: String(input.audioItem.id),
    audioPath: input.audioItem.audio_path,
    activeStream: input.audioItem.active_stream ?? null,
  };
  const mode =
    input.access === "full"
      ? resolveMusicListenSource(args)
      : resolveMusicCatalogPreviewMode(args);
  if (mode === "clip") {
    const path = input.audioItem.audio_path?.trim() ?? "";
    return path ? { bucket: "practice-audio", path } : null;
  }
  if (mode.kind === "missing") {
    return null;
  }
  return { bucket: mode.bucket, path: mode.path };
}

export type StudioMusicPreviewDecision =
  | { ok: true; access: "preview" | "full" }
  | { ok: false; status: number; code: string };

export function authorizeStudioMusicPreview(input: {
  practice: StudioMusicCatalogPublication | null;
  audioItem: StudioMusicPreviewAudioItem | null;
  publicationId: string;
  userId: string | null;
  canUse: boolean;
}): StudioMusicPreviewDecision {
  if (
    !isStudioMusicCatalogUuid(input.publicationId) ||
    !input.practice?.id
  ) {
    return { ok: false, status: 404, code: "not_found" };
  }

  if (String(input.practice.id) !== input.publicationId) {
    return { ok: false, status: 404, code: "not_found" };
  }

  if (!input.audioItem?.id) {
    return { ok: false, status: 404, code: "not_found" };
  }

  if (
    input.audioItem.practice_id &&
    String(input.audioItem.practice_id) !== input.publicationId
  ) {
    return { ok: false, status: 404, code: "wrong_relation" };
  }

  // Test-fixture publications are hidden from the public Studio listing
  // (filterPublicPracticeRows), so the pre-acquire preview excludes them too.
  const publicInventory =
    isPublicStudioMusicInventory(input.practice) &&
    !isFixtureMarkedPractice(input.practice);
  const publishedAudio =
    !input.audioItem.status || input.audioItem.status === "published";

  if (input.userId && input.canUse) {
    return { ok: true, access: "full" };
  }

  if (publicInventory && publishedAudio) {
    return {
      ok: true,
      access: isFreePublicStudioMusicInventory(input.practice)
        ? "full"
        : "preview",
    };
  }

  return { ok: false, status: 403, code: "forbidden" };
}

export type StudioMusicPreviewHandlerResult =
  | { type: "json"; status: number; body: { error: string } }
  | { type: "clip"; bytes: Uint8Array; startMs: number; endMs: number }
  | { type: "full"; response: Response };

export type StudioMusicPreviewStore = {
  loadPractice(
    publicationId: string,
  ): Promise<StudioMusicCatalogPublication | null>;
  loadAudioItem(
    audioItemId: string,
  ): Promise<StudioMusicPreviewAudioItem | null>;
  loadCanUse(userId: string, publicationId: string): Promise<boolean>;
  buildClip(input: {
    practiceId: string;
    audioItem: PreviewAudioItemRow;
    source: StudioMusicPreviewSource;
  }): Promise<{ bytes: Uint8Array; startMs: number; endMs: number }>;
  streamFullAudio(input: {
    audioItem: StudioMusicPreviewAudioItem;
    source: StudioMusicPreviewSource;
    rangeHeader: string;
  }): Promise<Response>;
};

export async function handleStudioMusicPreview(input: {
  publicationId: string | null;
  audioItemId: string | null;
  userId: string | null;
  rangeHeader?: string | null;
  store: StudioMusicPreviewStore;
}): Promise<StudioMusicPreviewHandlerResult> {
  if (
    !isStudioMusicCatalogUuid(input.publicationId) ||
    !isStudioMusicCatalogUuid(input.audioItemId)
  ) {
    return { type: "json", status: 400, body: { error: "invalid_request" } };
  }

  const [practice, audioItem] = await Promise.all([
    input.store.loadPractice(input.publicationId),
    input.store.loadAudioItem(input.audioItemId),
  ]);

  const canUse =
    input.userId && practice
      ? await input.store.loadCanUse(input.userId, String(practice.id))
      : false;

  const decision = authorizeStudioMusicPreview({
    practice,
    audioItem,
    publicationId: input.publicationId,
    userId: input.userId,
    canUse,
  });

  if (!decision.ok) {
    return {
      type: "json",
      status: decision.status,
      body: { error: decision.code },
    };
  }

  if (!audioItem) {
    return { type: "json", status: 404, body: { error: "not_found" } };
  }

  const source = resolveStudioMusicPreviewSource({
    productKind: practice?.product_kind,
    audioItem,
    access: decision.access,
  });
  if (!source) {
    return { type: "json", status: 404, body: { error: "audio_missing" } };
  }

  if (decision.access === "full") {
    return {
      type: "full",
      response: await input.store.streamFullAudio({
        audioItem,
        source,
        // Explicit Range makes catalog seeking reliable even when the media
        // element's initial metadata request omits it.
        rangeHeader: input.rangeHeader || "bytes=0-",
      }),
    };
  }

  const clip = await input.store.buildClip({
    practiceId: input.publicationId,
    audioItem,
    source,
  });

  return {
    type: "clip",
    bytes: clip.bytes,
    startMs: clip.startMs,
    endMs: clip.endMs,
  };
}

export function studioMusicPreviewJsonContainsForbiddenFields(
  value: unknown,
): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const text = JSON.stringify(value);
  return (
    text.includes("audio_path") ||
    text.includes("signedUrl") ||
    text.includes("signed_url") ||
    text.includes("/storage/v1/object") ||
    text.includes("practice-audio/")
  );
}

/*
 * loadPractice must return the source author's access_status (and the
 * publication dates): isPublicStudioMusicInventory gates the pre-acquire
 * preview on a commercial source author. Without the join every listener who
 * had not added the music yet got 403 and the Studio player closed at once
 * (t1540u, owner decision 18.11.2026: listening before «Добавить» is allowed).
 */
export function createSupabaseStudioMusicPreviewStore(
  supabase: SupabaseClient,
): StudioMusicPreviewStore {
  return {
    async loadPractice(publicationId) {
      const { data, error } = await supabase
        .from("practices")
        .select(
          `business_only,
          id,
          author_id,
          title,
          status,
          deleted_at,
          product_kind,
          publication_class,
          music_usage_permission,
          is_free,
          price,
          studio_music_pricing_mode,
          studio_music_price_minor,
          catalog_visibility,
          is_catalog_listed,
          published_at,
          scheduled_publish_at,
          cover_image,
          authors!practices_author_id_fkey (
            access_status
          )
        `,
        )
        .eq(BUSINESS_ONLY_COLUMN, false)
        .eq("id", publicationId)
        .maybeSingle();

      if (error) {
        throw new Error("studio_music_preview_practice_lookup_failed");
      }

      return (data as StudioMusicCatalogPublication | null) ?? null;
    },

    async loadAudioItem(audioItemId) {
      const { data, error } = await supabase
        .from("audio_items")
        .select(
          "id, practice_id, audio_path, status, duration_seconds, preview_start_ms, preview_end_ms, active_music_delivery_asset_id",
        )
        .eq("id", audioItemId)
        .maybeSingle();

      if (error) {
        throw new Error("studio_music_preview_audio_lookup_failed");
      }

      if (!data) {
        return null;
      }

      const { active_music_delivery_asset_id: activeAssetId, ...row } =
        data as StudioMusicPreviewAudioItem & {
          active_music_delivery_asset_id?: string | null;
        };
      let activeStream: MusicStreamCandidate | null = null;
      if (activeAssetId) {
        const { data: asset, error: assetError } = await supabase
          .from("music_audio_assets")
          .select(
            "audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path",
          )
          .eq("id", activeAssetId)
          .maybeSingle();
        if (assetError) {
          throw new Error("studio_music_preview_audio_lookup_failed");
        }
        if (asset) {
          activeStream = {
            audioItemId: String(asset.audio_item_id ?? ""),
            assetRole: String(asset.asset_role ?? ""),
            lifecycleState: String(asset.lifecycle_state ?? ""),
            storageBucket: String(asset.storage_bucket ?? ""),
            storagePath: String(asset.storage_path ?? ""),
          };
        }
      }

      return { ...row, active_stream: activeStream };
    },

    async loadCanUse(userId, publicationId) {
      const { data: practice, error: practiceError } = await supabase
        .from("practices")
        .select("business_only, id, author_id")
        .eq(BUSINESS_ONLY_COLUMN, false)
        .eq("id", publicationId)
        .maybeSingle();

      if (practiceError) {
        throw new Error("studio_music_preview_use_lookup_failed");
      }

      const [entitlementResult, memberResult] = await Promise.all([
        supabase
          .from("studio_music_entitlements")
          .select("revoked_at")
          .eq("user_id", userId)
          .eq("practice_id", publicationId)
          .is("revoked_at", null)
          .maybeSingle(),
        practice?.author_id
          ? supabase
              .from("author_members")
              .select("id")
              .eq("author_id", practice.author_id)
              .eq("user_id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (entitlementResult.error || memberResult.error) {
        throw new Error("studio_music_preview_use_lookup_failed");
      }

      return canUseMusicInStudio({
        entitlement: entitlementResult.data as StudioMusicCatalogEntitlement | null,
        isAuthorMember: Boolean(memberResult.data?.id),
      });
    },

    buildClip({ practiceId, audioItem, source }) {
      return buildPracticePreviewClip({
        storageClient: supabase,
        practiceId,
        audioItem,
        maxDurationMs: 60_000,
        source,
      });
    },

    async streamFullAudio({ source, rangeHeader }) {
      const audioPath = source.path.trim();
      if (!audioPath) {
        throw new Error("audio_missing");
      }
      const { data, error } = await supabase.storage
        .from(source.bucket)
        .createSignedUrl(audioPath, 60);
      const signedUrl = data?.signedUrl
        ? normalizeStorageSignedUrl(data.signedUrl)
        : null;
      if (error || !signedUrl) {
        throw new Error("preview_source_sign_failed");
      }
      const upstream = await fetch(signedUrl, {
        cache: "no-store",
        headers: { Range: rangeHeader },
      });
      if (upstream.status !== 206) {
        throw new Error("preview_source_fetch_failed");
      }
      const headers = new Headers();
      for (const name of [
        "Accept-Ranges",
        "Content-Length",
        "Content-Range",
        "Content-Type",
      ]) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      headers.set("Cache-Control", "private, no-store");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(upstream.body, { status: 206, headers });
    },
  };
}

export function clipErrorStatus(error: unknown): { status: number; code: string } {
  const code = error instanceof Error ? error.message : "preview_clip_failed";

  if (code === "audio_missing") {
    return { status: 404, code };
  }

  if (code === "preview_window_invalid" || code === "preview_clip_empty") {
    return { status: 422, code };
  }

  return { status: 500, code: "preview_clip_failed" };
}
