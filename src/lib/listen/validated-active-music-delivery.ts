import type { SupabaseClient } from "@supabase/supabase-js";

import {
  hasPublicTrackPlayableAudio,
  isVerifiedMusicStreamAsset,
  type MusicStreamCandidate,
} from "@/lib/listen/music-delivery";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AudioItemActiveDeliveryPointer = {
  id: string;
  audio_path?: string | null;
  active_music_delivery_asset_id?: string | null;
};

export type MusicAudioAssetValidationRow = {
  id: string;
  audio_item_id: string;
  asset_role: string;
  lifecycle_state: string;
  storage_bucket: string;
  storage_path: string | null;
};

export type LoadValidatedActiveMusicDeliveryOptions = {
  /** Injectable for tests; production uses service-role. */
  serviceRole?: SupabaseClient;
};

function asMusicStreamCandidate(
  asset: MusicAudioAssetValidationRow,
): MusicStreamCandidate {
  return {
    audioItemId: asset.audio_item_id,
    assetRole: asset.asset_role,
    lifecycleState: asset.lifecycle_state,
    storageBucket: asset.storage_bucket,
    storagePath: asset.storage_path ?? "",
  };
}

/**
 * Pure validation: returns audio_item ids whose active pointer resolves to a
 * verified music-streams asset for that same item. Never returns paths or asset ids.
 */
export function collectValidatedActiveMusicDeliveryItemIds(
  items: ReadonlyArray<AudioItemActiveDeliveryPointer>,
  assets: ReadonlyArray<MusicAudioAssetValidationRow>,
): Set<string> {
  const withPointer = items.filter((item) => item.active_music_delivery_asset_id);
  if (withPointer.length === 0) {
    return new Set();
  }

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const valid = new Set<string>();

  for (const item of withPointer) {
    const assetId = item.active_music_delivery_asset_id;
    if (!assetId) {
      continue;
    }

    const asset = byId.get(assetId);
    if (
      asset
      && asset.id === assetId
      && isVerifiedMusicStreamAsset(asMusicStreamCandidate(asset), item.id)
    ) {
      valid.add(item.id);
    }
  }

  return valid;
}

/**
 * Server-side: load and validate active music delivery assets for audio items.
 * Uses service-role. Does not expose storage paths or asset ids to callers —
 * only a Set of playable audio_item ids.
 */
export async function loadValidatedActiveMusicDeliveryItemIds(
  items: ReadonlyArray<AudioItemActiveDeliveryPointer>,
  options?: LoadValidatedActiveMusicDeliveryOptions,
): Promise<Set<string>> {
  const withPointer = items.filter((item) => item.active_music_delivery_asset_id);
  if (withPointer.length === 0) {
    return new Set();
  }

  const service = options?.serviceRole ?? createServiceRoleClient();
  const ids = [
    ...new Set(
      withPointer
        .map((item) => item.active_music_delivery_asset_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const { data, error } = await service
    .from("music_audio_assets")
    .select("id, audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path")
    .in("id", ids);

  if (error) {
    console.error("active_music_stream_validation_lookup_failed", error.message);
    return new Set();
  }

  return collectValidatedActiveMusicDeliveryItemIds(
    withPointer,
    (data ?? []) as MusicAudioAssetValidationRow[],
  );
}

export function hasListenTrackPlayableSource(input: {
  audioPath?: string | null;
  hasActiveDelivery?: boolean | null;
}): boolean {
  return hasPublicTrackPlayableAudio(input);
}

/**
 * Keep session/catalog/public lists on one playable rule:
 * non-empty audio_path OR validated active music-streams delivery (music only).
 */
export async function resolvePlayableAudioItemRows<
  T extends AudioItemActiveDeliveryPointer,
>(
  rows: ReadonlyArray<T>,
  productKind: string | null | undefined,
  options?: LoadValidatedActiveMusicDeliveryOptions,
): Promise<T[]> {
  const validatedActive =
    productKind === "music"
      ? await loadValidatedActiveMusicDeliveryItemIds(rows, options)
      : new Set<string>();

  return rows.filter((item) =>
    hasListenTrackPlayableSource({
      audioPath: item.audio_path,
      hasActiveDelivery: validatedActive.has(item.id),
    }),
  );
}
