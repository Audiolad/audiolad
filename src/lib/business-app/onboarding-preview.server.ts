import "server-only";
import { soundAllowedTrackIds } from "@/lib/business/track-sound-review.server";

import { hasLiveBusinessAccess } from "@/lib/access-grants/access-line";
import { peekBusinessChromeAccess } from "@/lib/access-grants/peek.server";
import { isEmailConfirmed } from "@/lib/access-grants/policy";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import {
  authorizeOnboardingPreview,
  onboardingPreviewFragment,
} from "@/lib/business-app/onboarding-preview-access";
import { businessOnboardingAtmosphereSound } from "@/lib/business-app/onboarding-wizard";
import { displayWorkspaceTrackTitle } from "@/lib/business-workspace/display-title";
import { sourcesForSpace } from "@/lib/business-workspace/catalog-sources";
import {
  PRACTICE_AUDIO_BUCKET,
  resolveMusicCatalogPreviewMode,
  type MusicStreamCandidate,
} from "@/lib/listen/music-delivery";
import { buildPreviewClipFromStorageSource } from "@/lib/listen/serve-preview-clip";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type OnboardingPreviewTrack = {
  title: string;
  authorName: string;
};

type PreviewSource = OnboardingPreviewTrack & {
  audioItemId: string;
  practiceId: string;
  bucket: string;
  path: string;
  startMs: number;
  endMs: number;
};

/**
 * Live trial or paid period only. Does not issue a gift and does not sign storage.
 */
export async function loadOnboardingPreviewGate(): Promise<"allow" | "no_access"> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isEmailConfirmed(user)) return "no_access";
    const chrome = await peekBusinessChromeAccess();
    const domain = await loadBusinessOwnerHomeContext();
    const hasActiveVenue = domain.status === "authenticated" && domain.location != null;
    return authorizeOnboardingPreview({
      signedIn: true,
      emailConfirmed: true,
      liveTrialOrPaid: hasLiveBusinessAccess(chrome),
      hasActiveVenue,
    });
  } catch {
    return "no_access";
  }
}

async function findPreviewSource(atmosphereId: string): Promise<PreviewSource | null> {
  const sound = businessOnboardingAtmosphereSound(atmosphereId);
  if (!sound) return null;
  const source = sourcesForSpace("cafe").find((row) => (row.sounds as readonly string[]).includes(sound));
  if (!source) return null;
  let db: ReturnType<typeof createServiceRoleClient>;
  try {
    db = createServiceRoleClient();
  } catch {
    return null;
  }
  const { data: practices, error } = await db
    .from("practices")
    .select("id, title, authors!practices_author_id_fkey(name)")
    .eq("author_id", source.authorId)
    .eq("status", "published")
    .eq("product_kind", "music")
    .eq("catalog_visibility", "listed")
    .is("deleted_at", null)
    .limit(8);
  if (error || !Array.isArray(practices) || practices.length === 0) return null;
  const practiceIds = practices.map((row) => row.id as string);
  const { data: tracks, error: trackError } = await db
    .from("audio_items")
    .select("id, title, practice_id, audio_path, duration_seconds, preview_start_ms, preview_end_ms, active_music_delivery_asset_id")
    .in("practice_id", practiceIds)
    .eq("status", "published")
    .limit(12);
  if (trackError || !Array.isArray(tracks)) return null;
  let soundAllowed: Set<string>;
  try { soundAllowed = await soundAllowedTrackIds(tracks.map((track) => track.id as string), "cafe", db); }
  catch { return null; }
  for (const track of tracks) {
    if (!soundAllowed.has(track.id as string)) continue;
    const practice = practices.find((row) => row.id === track.practice_id);
    const author = practice?.authors as { name?: string | null } | { name?: string | null }[] | null;
    const authorName = (Array.isArray(author) ? author[0]?.name : author?.name)?.trim() || "";
    const title = displayWorkspaceTrackTitle({
      title: typeof track.title === "string" ? track.title : "",
      albumTitle: typeof practice?.title === "string" ? practice.title : null,
      practiceTitle: typeof practice?.title === "string" ? practice.title : null,
    });
    if (!title || !practice) continue;
    const located = await locatePreviewBytes(db, track);
    if (!located) continue;
    const fragment = onboardingPreviewFragment({
      duration_seconds: typeof track.duration_seconds === "number" ? track.duration_seconds : null,
      preview_start_ms: typeof track.preview_start_ms === "number" ? track.preview_start_ms : null,
      preview_end_ms: typeof track.preview_end_ms === "number" ? track.preview_end_ms : null,
    });
    if (fragment.endMs <= fragment.startMs) continue;
    return {
      title,
      authorName: authorName || "АудиоЛад",
      audioItemId: track.id as string,
      practiceId: practice.id as string,
      bucket: located.bucket,
      path: located.path,
      startMs: fragment.startMs,
      endMs: fragment.endMs,
    };
  }
  return null;
}

async function locatePreviewBytes(
  db: ReturnType<typeof createServiceRoleClient>,
  track: { id: string; audio_path: string | null; active_music_delivery_asset_id: string | null },
): Promise<{ bucket: string; path: string } | null> {
  let activeStream: MusicStreamCandidate | null = null;
  const assetId = track.active_music_delivery_asset_id;
  if (assetId) {
    const { data: asset } = await db
      .from("music_audio_assets")
      .select("audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path")
      .eq("id", assetId)
      .maybeSingle();
    if (asset) {
      activeStream = {
        audioItemId: asset.audio_item_id as string,
        assetRole: asset.asset_role as string,
        lifecycleState: asset.lifecycle_state as string,
        storageBucket: asset.storage_bucket as string,
        storagePath: asset.storage_path as string,
      };
    }
  }
  const mode = resolveMusicCatalogPreviewMode({
    productKind: "music",
    audioItemId: track.id,
    audioPath: track.audio_path,
    activeStream,
  });
  if (mode === "clip") {
    const path = track.audio_path?.trim() ?? "";
    return path ? { bucket: PRACTICE_AUDIO_BUCKET, path } : null;
  }
  if (mode.kind === "missing") return null;
  return { bucket: mode.bucket, path: mode.path };
}

/** Title and author for the wizard. No storage URL. */
export async function loadOnboardingPreviewTrack(atmosphereId: string): Promise<OnboardingPreviewTrack | null> {
  const found = await findPreviewSource(atmosphereId);
  if (!found) return null;
  return { title: found.title, authorName: found.authorName };
}

/** Short MPEG fragment. The storage sign used to download the source stays on the server. */
export async function loadOnboardingPreviewClip(atmosphereId: string): Promise<Uint8Array | null> {
  const found = await findPreviewSource(atmosphereId);
  if (!found) return null;
  try {
    return await buildPreviewClipFromStorageSource({
      storageClient: createServiceRoleClient(),
      bucket: found.bucket,
      path: found.path,
      startMs: found.startMs,
      endMs: found.endMs,
      cacheKey: `onboarding:${found.practiceId}:${found.audioItemId}:${found.startMs}:${found.endMs}`,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    console.error(
      "onboarding_preview_clip_failed",
      code === "preview_source_sign_failed" || code === "preview_clip_empty" || code === "preview_clip_too_large"
        ? code
        : "preview_clip_failed",
    );
    return null;
  }
}
