import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildPracticePreviewClip,
  type PreviewAudioItemRow,
} from "@/lib/listen/serve-preview-clip";

import { canUseMusicInStudio } from "./access";
import {
  isPublicStudioMusicInventory,
  isStudioMusicCatalogUuid,
  type StudioMusicCatalogEntitlement,
  type StudioMusicCatalogPublication,
} from "./catalog";

export type StudioMusicPreviewAudioItem = PreviewAudioItemRow & {
  practice_id?: string | null;
};

export type StudioMusicPreviewDecision =
  | { ok: true }
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

  const publicInventory = isPublicStudioMusicInventory(input.practice);
  const publishedAudio =
    !input.audioItem.status || input.audioItem.status === "published";

  if (publicInventory && publishedAudio) {
    return { ok: true };
  }

  if (input.userId && input.canUse) {
    return { ok: true };
  }

  return { ok: false, status: 403, code: "forbidden" };
}

export type StudioMusicPreviewHandlerResult =
  | { type: "json"; status: number; body: { error: string } }
  | { type: "clip"; bytes: Uint8Array; startMs: number; endMs: number };

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
  }): Promise<{ bytes: Uint8Array; startMs: number; endMs: number }>;
};

export async function handleStudioMusicPreview(input: {
  publicationId: string | null;
  audioItemId: string | null;
  userId: string | null;
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

  const clip = await input.store.buildClip({
    practiceId: input.publicationId,
    audioItem,
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

export function createSupabaseStudioMusicPreviewStore(
  supabase: SupabaseClient,
): StudioMusicPreviewStore {
  return {
    async loadPractice(publicationId) {
      const { data, error } = await supabase
        .from("practices")
        .select(
          `
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
          is_catalog_listed
        `,
        )
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
          "id, practice_id, audio_path, status, duration_seconds, preview_start_ms, preview_end_ms",
        )
        .eq("id", audioItemId)
        .maybeSingle();

      if (error) {
        throw new Error("studio_music_preview_audio_lookup_failed");
      }

      return (data as StudioMusicPreviewAudioItem | null) ?? null;
    },

    async loadCanUse(userId, publicationId) {
      const { data: practice, error: practiceError } = await supabase
        .from("practices")
        .select("id, author_id")
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

    buildClip({ practiceId, audioItem }) {
      return buildPracticePreviewClip({
        storageClient: supabase,
        practiceId,
        audioItem,
      });
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
