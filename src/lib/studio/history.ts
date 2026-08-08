import {
  getStudioClipLayout,
  type StudioClip,
} from "@/lib/studio/clip-math";
import { clampStudioClipFades } from "@/lib/studio/fade-math";

export const MAX_STUDIO_HISTORY_SNAPSHOTS = 50;

/**
 * Serializable editing data only. Audio files, decoded buffers, and Web Audio
 * nodes intentionally remain in the provider's asset vault.
 */
export type StudioTrackSnapshot = {
  id: string;
  fileName: string;
  fileSize: number;
  clips: StudioClip[];
  volume: number;
  muted: boolean;
};

export type StudioSlotSnapshot = {
  id: string;
  name: string;
  audioTrackId: string | null;
};

export type StudioEditingSnapshot = {
  tracks: StudioTrackSnapshot[];
  slots: StudioSlotSnapshot[];
  selectedClipId: string | null;
  position: number;
};

export type StudioHistory = {
  past: StudioEditingSnapshot[];
  future: StudioEditingSnapshot[];
};

export type StudioClipClipboard = {
  sourceTrackId: string;
  clips: StudioClip[];
};

function cloneClip(clip: StudioClip): StudioClip {
  return { ...clip };
}

function cloneSlot(slot: StudioSlotSnapshot): StudioSlotSnapshot {
  return { ...slot };
}

export function cloneStudioTrackSnapshot(
  track: StudioTrackSnapshot,
): StudioTrackSnapshot {
  return {
    ...track,
    clips: track.clips.map(cloneClip),
  };
}

export function createStudioEditingSnapshot({
  tracks,
  slots,
  selectedClipId,
  position,
}: StudioEditingSnapshot): StudioEditingSnapshot {
  return {
    tracks: tracks.map(cloneStudioTrackSnapshot),
    slots: slots.map(cloneSlot),
    selectedClipId: selectedClipId ?? null,
    position: Number.isFinite(position) && position >= 0 ? position : 0,
  };
}

export function createStudioHistory(
  initial: StudioEditingSnapshot,
): StudioHistory {
  return { past: [createStudioEditingSnapshot(initial)], future: [] };
}

export function recordStudioHistory(
  history: StudioHistory,
  next: StudioEditingSnapshot,
  maxSnapshots = MAX_STUDIO_HISTORY_SNAPSHOTS,
): StudioHistory {
  const max = Number.isFinite(maxSnapshots)
    ? Math.max(1, Math.floor(maxSnapshots))
    : MAX_STUDIO_HISTORY_SNAPSHOTS;
  return {
    past: [...history.past, createStudioEditingSnapshot(next)].slice(-max),
    future: [],
  };
}

export function undoStudioHistory(
  history: StudioHistory,
): { history: StudioHistory; snapshot: StudioEditingSnapshot | null } {
  if (history.past.length < 2) {
    return { history, snapshot: null };
  }

  const current = history.past.at(-1);
  const past = history.past.slice(0, -1);
  const snapshot = past.at(-1);
  if (!current || !snapshot) {
    return { history, snapshot: null };
  }

  return {
    history: {
      past,
      future: [createStudioEditingSnapshot(current), ...history.future],
    },
    snapshot: createStudioEditingSnapshot(snapshot),
  };
}

export function redoStudioHistory(
  history: StudioHistory,
): { history: StudioHistory; snapshot: StudioEditingSnapshot | null } {
  const next = history.future[0];
  if (!next) {
    return { history, snapshot: null };
  }

  return {
    history: {
      past: [...history.past, createStudioEditingSnapshot(next)].slice(
        -MAX_STUDIO_HISTORY_SNAPSHOTS,
      ),
      future: history.future.slice(1),
    },
    snapshot: createStudioEditingSnapshot(next),
  };
}

export function createStudioClipClipboard(
  sourceTrackId: string,
  clips: Iterable<StudioClip>,
): StudioClipClipboard {
  return {
    sourceTrackId,
    clips: Array.from(clips, cloneClip),
  };
}

export function getStudioPasteClips({
  clipboard,
  targetStartTime,
  targetBufferDuration,
  createClipId,
}: {
  clipboard: StudioClipClipboard;
  targetStartTime: number;
  targetBufferDuration: number;
  createClipId: () => string;
}): StudioClip[] {
  const origin = clipboard.clips.length > 0
    ? Math.min(...clipboard.clips.map((clip) => clip.startTime))
    : 0;
  const start = Number.isFinite(targetStartTime)
    ? Math.max(0, targetStartTime)
    : 0;

  return clipboard.clips.flatMap((clip) => {
    const layout = getStudioClipLayout(
      {
        startTime: start + (clip.startTime - origin),
        offset: clip.offset,
        duration: clip.duration,
      },
      targetBufferDuration,
    );
    if (layout.duration <= 0) {
      return [];
    }

    return [{
      ...clip,
      id: createClipId(),
      ...layout,
      ...clampStudioClipFades(clip, layout.duration),
    }];
  });
}
