import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { canPlayCourseAudioItem } from "@/lib/course-content/learner-assets";
import { isCoursePublication } from "@/lib/course-content/validators";
import { resolveListenAccess } from "@/lib/listen/access";
import { shouldEnforcePublishedAudioItemForEntitledSignedUrl } from "@/lib/listen/course-audio-status";
import {
  resolveMusicListenSource,
  type MusicStreamCandidate,
} from "@/lib/listen/music-delivery";
import {
  LISTEN_SIGNED_URL_TTL_SECONDS,
  normalizeStorageSignedUrl,
} from "@/lib/listen/signed-url";
import {
  canEntitledUserAccessPracticeStatus,
  type ProductAccessInput,
} from "@/lib/products/access";
import { getPracticeByAuthorAndSlug } from "@/lib/products/lookup";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type SignEntitledListenAudioResult =
  | { ok: true; url: string; expiresIn: number }
  | {
      ok: false;
      reason:
        | "not_found"
        | "access_required"
        | "forbidden"
        | "audio_missing"
        | "sign_failed"
        | "storage_unavailable";
    };

export type SignEntitledListenAudioDeps = {
  getPractice?: typeof getPracticeByAuthorAndSlug;
  resolveAccess?: typeof resolveListenAccess;
  canPlayCourse?: typeof canPlayCourseAudioItem;
  loadActiveStream?: (
    audioItemId: string,
    activeAssetId: string | null | undefined,
  ) => Promise<MusicStreamCandidate | null>;
  signPath?: (
    bucket: string,
    path: string,
  ) => Promise<{ url: string } | null>;
  createClient?: () => SupabaseClient;
};

async function defaultLoadActiveStream(
  audioItemId: string,
  activeAssetId: string | null | undefined,
): Promise<MusicStreamCandidate | null> {
  if (!activeAssetId) {
    return null;
  }

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole
    .from("music_audio_assets")
    .select("id, audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path")
    .eq("id", activeAssetId)
    .maybeSingle();

  if (error || !data || data.audio_item_id !== audioItemId) {
    return null;
  }

  return {
    audioItemId: data.audio_item_id,
    assetRole: data.asset_role,
    lifecycleState: data.lifecycle_state,
    storageBucket: data.storage_bucket,
    storagePath: data.storage_path,
  };
}

async function defaultSignPath(bucket: string, path: string) {
  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole.storage
    .from(bucket)
    .createSignedUrl(path, LISTEN_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);
  return url ? { url } : null;
}

function signedOk(url: string): SignEntitledListenAudioResult {
  return { ok: true, url, expiresIn: LISTEN_SIGNED_URL_TTL_SECONDS };
}

/**
 * Canonical entitled/full-listen signing with an explicit trusted userId.
 * Does not implement catalog preview or clip playback.
 */
export async function signEntitledListenAudio(
  input: {
    userId: string | null;
    authorSlug: string;
    productSlug: string;
    audioId: string;
    practice?: ProductAccessInput | null;
  },
  deps: SignEntitledListenAudioDeps = {},
): Promise<SignEntitledListenAudioResult> {
  const supabase = deps.createClient?.() ?? createServiceRoleClient();
  const getPractice = deps.getPractice ?? getPracticeByAuthorAndSlug;
  const resolveAccess = deps.resolveAccess ?? resolveListenAccess;
  const canPlayCourse = deps.canPlayCourse ?? canPlayCourseAudioItem;
  const loadActiveStream = deps.loadActiveStream ?? defaultLoadActiveStream;
  const signPath = deps.signPath ?? defaultSignPath;

  let practice = input.practice ?? null;
  if (!practice) {
    const loaded = await getPractice(supabase, input.authorSlug, input.productSlug);
    if (loaded.error) {
      return { ok: false, reason: "storage_unavailable" };
    }
    practice = loaded.practice;
  }

  if (!practice) {
    return { ok: false, reason: "not_found" };
  }

  const access = await resolveAccess(supabase, input.userId, practice);
  if (!access) {
    return { ok: false, reason: "access_required" };
  }

  const isCourse = isCoursePublication(
    practice.publication_class,
    practice.product_kind,
  );
  const serviceRole = supabase;

  if (isCourse) {
    try {
      const playable = await canPlayCourse({
        supabase,
        serviceRole,
        practice,
        userId: input.userId,
        audioItemId: input.audioId,
      });
      if (!playable) {
        return { ok: false, reason: "forbidden" };
      }

      const { data: courseAudio, error } = await serviceRole
        .from("audio_items")
        .select("id, practice_id, audio_path, status")
        .eq("id", input.audioId)
        .eq("practice_id", practice.id)
        .maybeSingle();

      if (error) {
        return { ok: false, reason: "storage_unavailable" };
      }

      const audioPath = courseAudio?.audio_path?.trim() ?? null;
      if (!courseAudio?.id || !audioPath) {
        return { ok: false, reason: courseAudio?.id ? "audio_missing" : "not_found" };
      }

      const signed = await signPath("practice-audio", audioPath);
      return signed ? signedOk(signed.url) : { ok: false, reason: "sign_failed" };
    } catch {
      return { ok: false, reason: "storage_unavailable" };
    }
  }

  const { data: audioItem, error: audioLookupError } = await serviceRole
    .from("audio_items")
    .select(
      "id, practice_id, audio_path, status, active_music_delivery_asset_id",
    )
    .eq("id", input.audioId)
    .eq("practice_id", practice.id)
    .maybeSingle();

  if (audioLookupError) {
    return { ok: false, reason: "storage_unavailable" };
  }

  let audioPath: string | null = null;
  let audioStatus: string | null = null;

  if (audioItem?.id) {
    audioPath = audioItem.audio_path?.trim() ?? null;
    audioStatus = audioItem.status;
  } else if (input.audioId === `legacy-${practice.id}`) {
    const { data: legacyPractice, error: legacyError } = await serviceRole
      .from("practices")
      .select("audio_url")
      .eq("id", practice.id)
      .maybeSingle();

    if (legacyError) {
      return { ok: false, reason: "storage_unavailable" };
    }

    audioPath = legacyPractice?.audio_url?.trim() ?? null;
    audioStatus = "published";
  } else {
    return { ok: false, reason: "not_found" };
  }

  const activeStream = audioItem?.id
    ? await loadActiveStream(audioItem.id, audioItem.active_music_delivery_asset_id)
    : null;
  const listenSource = resolveMusicListenSource({
    productKind: practice.product_kind ?? "",
    audioItemId: input.audioId,
    audioPath,
    activeStream,
  });

  if (
    access.mode === "entitled" &&
    shouldEnforcePublishedAudioItemForEntitledSignedUrl(isCourse)
  ) {
    if (!canEntitledUserAccessPracticeStatus(practice.status)) {
      return { ok: false, reason: "forbidden" };
    }
    if (audioStatus !== "published") {
      return { ok: false, reason: "forbidden" };
    }
  }

  if (listenSource.kind === "missing") {
    return { ok: false, reason: "audio_missing" };
  }

  const signed = await signPath(listenSource.bucket, listenSource.path);
  return signed ? signedOk(signed.url) : { ok: false, reason: "sign_failed" };
}
