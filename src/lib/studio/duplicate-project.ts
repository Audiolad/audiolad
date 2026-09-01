import { randomUUID } from "node:crypto";

import type { StudioProjectDataV2 } from "./server/model";

export type StudioProjectDuplicateAsset = {
  sourceAssetId: string;
  assetId: string;
};

export function remapStudioProjectForDuplicate(
  source: StudioProjectDataV2,
): { projectData: StudioProjectDataV2; assets: StudioProjectDuplicateAsset[] } {
  const trackIds = new Map<string, string>();
  const assetIds = new Map<string, string>();
  const assets: StudioProjectDuplicateAsset[] = [];

  for (const track of source.tracks) {
    trackIds.set(track.id, randomUUID());
    if (!assetIds.has(track.assetId)) {
      const assetId = randomUUID();
      assetIds.set(track.assetId, assetId);
      assets.push({ sourceAssetId: track.assetId, assetId });
    }
  }

  return {
    assets,
    projectData: {
      ...source,
      editor: { ...source.editor },
      slots: source.slots.map((slot) => ({
        ...slot,
        id: randomUUID(),
        audioTrackId: slot.audioTrackId
          ? trackIds.get(slot.audioTrackId) ?? null
          : null,
      })),
      tracks: source.tracks.map((track) => ({
        ...track,
        id: trackIds.get(track.id)!,
        assetId: assetIds.get(track.assetId)!,
        clips: track.clips.map((clip) => ({ ...clip, id: randomUUID() })),
      })),
    },
  };
}
