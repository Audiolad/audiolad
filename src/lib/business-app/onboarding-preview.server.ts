import "server-only";

import { businessOnboardingAtmosphereSound } from "@/lib/business-app/onboarding-wizard";
import { displayWorkspaceTrackTitle } from "@/lib/business-workspace/display-title";
import { sourcesForSpace } from "@/lib/business-workspace/catalog-sources";
import { signWorkspaceAudio } from "@/lib/business-workspace/sign.server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type OnboardingPreviewTrack = {
  title: string;
  authorName: string;
  url: string;
};

/**
 * One published track from the catalog source that matches the chosen atmosphere.
 * No rights fan-out: the venue does not exist yet, and the wizard only previews.
 */
export async function loadOnboardingPreviewTrack(
  atmosphereId: string | null,
): Promise<OnboardingPreviewTrack | null> {
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
    .select("id, title, practice_id, audio_path, active_music_delivery_asset_id")
    .in("practice_id", practiceIds)
    .eq("status", "published")
    .limit(12);
  if (trackError || !Array.isArray(tracks)) return null;
  for (const track of tracks) {
    const practice = practices.find((row) => row.id === track.practice_id);
    const author = practice?.authors as { name?: string | null } | { name?: string | null }[] | null;
    const authorName = (Array.isArray(author) ? author[0]?.name : author?.name)?.trim() || "";
    const title = displayWorkspaceTrackTitle({
      title: typeof track.title === "string" ? track.title : "",
      albumTitle: typeof practice?.title === "string" ? practice.title : null,
      practiceTitle: typeof practice?.title === "string" ? practice.title : null,
    });
    const playable = Boolean(
      (typeof track.audio_path === "string" && track.audio_path.trim())
      || track.active_music_delivery_asset_id,
    );
    if (!title || !playable) continue;
    const signed = await signWorkspaceAudio(track.id as string, new Set([track.id as string]));
    if (!signed.ok) continue;
    return { title, authorName: authorName || "АудиоЛад", url: signed.url };
  }
  return null;
}
