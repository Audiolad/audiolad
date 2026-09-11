import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE,
  CATALOG_MUSIC_UNAVAILABLE,
  canAdoptCatalogAccessPrincipal,
  evaluateLiveCatalogRenderAccess,
  type StudioCatalogRenderAudioItem,
  type StudioCatalogRenderLiveRow,
} from "../catalog-asset";
import type { StudioRenderCatalogAsset, StudioRenderSnapshot } from "./types";
import { isStudioRenderCatalogAsset } from "./types";

export type StudioCatalogQueueAsset = {
  id: string;
  project_id: string;
  source_type: string;
  deleted_at: string | null;
  catalog_practice_id?: string | null;
  catalog_audio_item_id?: string | null;
  catalog_access_user_id?: string | null;
};

export const PRACTICE_AUDIO_BUCKET = "practice-audio";

export class StudioCatalogMusicUnavailableError extends Error {
  readonly code = CATALOG_MUSIC_UNAVAILABLE;

  constructor() {
    super(CATALOG_MUSIC_UNAVAILABLE);
    this.name = "StudioCatalogMusicUnavailableError";
  }
}

export function snapshotHasCatalogMusic(snapshot: StudioRenderSnapshot): boolean {
  return snapshot.assets.some(isStudioRenderCatalogAsset);
}

export async function rpcCanUseMusicInStudio(
  service: SupabaseClient,
  userId: string,
  practiceId: string,
): Promise<boolean> {
  const { data, error } = await service.rpc("can_use_music_in_studio", {
    p_user_id: userId,
    p_practice_id: practiceId,
  });
  if (error) {
    throw error;
  }
  return data === true;
}

export async function loadLiveCatalogAssetRow(
  service: SupabaseClient,
  assetId: string,
): Promise<StudioCatalogRenderLiveRow | null> {
  const { data, error } = await service
    .from("studio_project_assets")
    .select(
      "id, project_id, source_type, deleted_at, catalog_practice_id, catalog_audio_item_id, catalog_access_user_id",
    )
    .eq("id", assetId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data ?? null) as StudioCatalogRenderLiveRow | null;
}

export async function loadCatalogAudioItem(
  service: SupabaseClient,
  audioItemId: string,
): Promise<StudioCatalogRenderAudioItem | null> {
  const { data, error } = await service
    .from("audio_items")
    .select("id, practice_id, audio_path")
    .eq("id", audioItemId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data ?? null) as StudioCatalogRenderAudioItem | null;
}

export async function assertLiveCatalogRenderAccess(
  service: SupabaseClient,
  input: {
    jobProjectId: string;
    asset: StudioRenderCatalogAsset;
    requireAudioPath: boolean;
  },
): Promise<{ catalogAccessUserId: string; audioPath?: string }> {
  const live = await loadLiveCatalogAssetRow(service, input.asset.id);
  const canUse =
    live?.catalog_access_user_id && live.catalog_practice_id
      ? await rpcCanUseMusicInStudio(
          service,
          live.catalog_access_user_id,
          live.catalog_practice_id,
        )
      : false;
  const audioItem = input.requireAudioPath
    ? await loadCatalogAudioItem(service, input.asset.audioItemId)
    : null;
  const decision = evaluateLiveCatalogRenderAccess({
    jobProjectId: input.jobProjectId,
    snapshotAssetId: input.asset.id,
    snapshotPracticeId: input.asset.practiceId,
    snapshotAudioItemId: input.asset.audioItemId,
    live,
    canUseMusicInStudio: canUse,
    audioItem,
    requireAudioPath: input.requireAudioPath,
  });
  if (!decision.ok) {
    throw new StudioCatalogMusicUnavailableError();
  }
  return {
    catalogAccessUserId: decision.catalogAccessUserId,
    audioPath: decision.audioPath,
  };
}

export async function materializeCatalogRenderSource(
  service: SupabaseClient,
  input: {
    jobProjectId: string;
    asset: StudioRenderCatalogAsset;
    workspace: string;
  },
): Promise<string> {
  const authorized = await assertLiveCatalogRenderAccess(service, {
    jobProjectId: input.jobProjectId,
    asset: input.asset,
    requireAudioPath: true,
  });
  const audioPath = authorized.audioPath?.trim() ?? "";
  if (!audioPath) {
    throw new StudioCatalogMusicUnavailableError();
  }
  const { data, error } = await service.storage
    .from(PRACTICE_AUDIO_BUCKET)
    .download(audioPath);
  if (error || !data) {
    throw new StudioCatalogMusicUnavailableError();
  }
  const dest = join(input.workspace, `${input.asset.id}.audio`);
  await writeFile(dest, Buffer.from(await data.arrayBuffer()));
  return dest;
}

export async function assertCatalogRenderAccessStillValid(
  service: SupabaseClient,
  input: {
    jobProjectId: string;
    snapshot: StudioRenderSnapshot;
  },
): Promise<void> {
  for (const asset of input.snapshot.assets) {
    if (!isStudioRenderCatalogAsset(asset)) {
      continue;
    }
    await assertLiveCatalogRenderAccess(service, {
      jobProjectId: input.jobProjectId,
      asset,
      requireAudioPath: false,
    });
  }
}

export const CATALOG_RENDER_UNAVAILABLE_CLIENT_MESSAGE =
  CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE;

export async function persistCatalogAccessPrincipal(
  service: SupabaseClient,
  input: {
    assetId: string;
    projectId: string;
    userId: string;
  },
): Promise<string | null> {
  const { data, error } = await service
    .from("studio_project_assets")
    .update({ catalog_access_user_id: input.userId })
    .eq("id", input.assetId)
    .eq("project_id", input.projectId)
    .eq("source_type", "catalog")
    .is("catalog_access_user_id", null)
    .is("deleted_at", null)
    .select("catalog_access_user_id")
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data?.catalog_access_user_id as string | null | undefined) ?? null;
}

export async function authorizeCatalogAssetsForStudioRender(input: {
  service: SupabaseClient;
  projectId: string;
  currentUserId: string | null;
  hasProjectAccess: boolean;
  tracks: readonly { assetId?: string | null; clips?: readonly unknown[] }[];
  assets: readonly StudioCatalogQueueAsset[];
}): Promise<void> {
  const referenced = new Set(
    input.tracks
      .filter((track) => (Array.isArray(track.clips) ? track.clips.length > 0 : true))
      .map((track) => track.assetId)
      .filter((id): id is string => Boolean(id)),
  );
  const catalogAssets = input.assets.filter(
    (asset) =>
      referenced.has(asset.id) &&
      asset.source_type === "catalog" &&
      asset.deleted_at == null,
  );
  if (catalogAssets.length === 0) {
    return;
  }

  for (const asset of catalogAssets) {
    let principal = asset.catalog_access_user_id ?? null;
    if (!principal) {
      const currentCanUse =
        input.currentUserId && asset.catalog_practice_id
          ? await rpcCanUseMusicInStudio(
              input.service,
              input.currentUserId,
              asset.catalog_practice_id,
            )
          : false;
      if (
        !canAdoptCatalogAccessPrincipal({
          catalogAccessUserId: principal,
          currentUserId: input.currentUserId,
          hasProjectAccess: input.hasProjectAccess,
          canUseMusicInStudio: currentCanUse,
        }) ||
        !input.currentUserId
      ) {
        throw new StudioCatalogMusicUnavailableError();
      }
      principal = await persistCatalogAccessPrincipal(input.service, {
        assetId: asset.id,
        projectId: input.projectId,
        userId: input.currentUserId,
      });
      if (!principal) {
        const live = await loadLiveCatalogAssetRow(input.service, asset.id);
        principal = live?.catalog_access_user_id ?? null;
      }
      if (!principal) {
        throw new StudioCatalogMusicUnavailableError();
      }
    }

    const canUse = asset.catalog_practice_id
      ? await rpcCanUseMusicInStudio(
          input.service,
          principal,
          asset.catalog_practice_id,
        )
      : false;
    const decision = evaluateLiveCatalogRenderAccess({
      jobProjectId: input.projectId,
      snapshotAssetId: asset.id,
      snapshotPracticeId: asset.catalog_practice_id,
      snapshotAudioItemId: asset.catalog_audio_item_id,
      live: {
        id: asset.id,
        project_id: asset.project_id,
        source_type: asset.source_type,
        deleted_at: asset.deleted_at,
        catalog_practice_id: asset.catalog_practice_id,
        catalog_audio_item_id: asset.catalog_audio_item_id,
        catalog_access_user_id: principal,
      },
      canUseMusicInStudio: canUse,
      requireAudioPath: false,
    });
    if (!decision.ok) {
      throw new StudioCatalogMusicUnavailableError();
    }
  }
}
