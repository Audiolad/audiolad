export const MAX_CONCURRENT_MUSIC_UPLOADS = 3;

export type MusicUploadKind = "master" | "legacy";

export type MusicQueuePhase = "ready" | "queued" | "uploading" | "error";

export type MusicQueueEntry = {
  audioId: string;
  kind: MusicUploadKind;
  phase: MusicQueuePhase;
  generation: number;
  fileName: string;
  errorMessage?: string;
};

export type MusicQueueSnapshot = {
  entries: MusicQueueEntry[];
};

export type MusicQueueStep = {
  snapshot: MusicQueueSnapshot;
  launchIds: string[];
};

export function emptyMusicQueue(): MusicQueueSnapshot {
  return { entries: [] };
}

export function musicQueueEntry(
  snapshot: MusicQueueSnapshot,
  audioId: string,
): MusicQueueEntry | null {
  return snapshot.entries.find((entry) => entry.audioId === audioId) ?? null;
}

export function musicUploadActiveCount(snapshot: MusicQueueSnapshot): number {
  return snapshot.entries.filter((entry) => entry.phase === "uploading").length;
}

export function musicQueueHasLocalFile(snapshot: MusicQueueSnapshot): boolean {
  return snapshot.entries.some(
    (entry) =>
      entry.phase === "ready" ||
      entry.phase === "queued" ||
      entry.phase === "uploading" ||
      entry.phase === "error",
  );
}

export function musicQueueHasReady(snapshot: MusicQueueSnapshot): boolean {
  return snapshot.entries.some((entry) => entry.phase === "ready");
}

function fillSlots(entries: MusicQueueEntry[]): {
  entries: MusicQueueEntry[];
  launchIds: string[];
} {
  const launchIds: string[] = [];
  let active = entries.filter((entry) => entry.phase === "uploading").length;
  const next = entries.map((entry) => {
    if (entry.phase !== "queued" || active >= MAX_CONCURRENT_MUSIC_UPLOADS) {
      return entry;
    }
    active += 1;
    launchIds.push(entry.audioId);
    return { ...entry, phase: "uploading" as const };
  });
  return { entries: next, launchIds };
}

export function stageMusicFile(
  snapshot: MusicQueueSnapshot,
  audioId: string,
  kind: MusicUploadKind,
  fileName: string,
): MusicQueueStep {
  const current = musicQueueEntry(snapshot, audioId);
  const without = snapshot.entries.filter((entry) => entry.audioId !== audioId);
  const nextEntry: MusicQueueEntry = {
    audioId,
    kind,
    phase: current?.phase === "queued" ? "queued" : "ready",
    generation: (current?.generation ?? 0) + 1,
    fileName,
  };
  if (current?.phase === "uploading") {
    const filled = fillSlots(without);
    return {
      snapshot: {
        entries: [...filled.entries, { ...nextEntry, phase: "ready" }],
      },
      launchIds: filled.launchIds,
    };
  }
  return { snapshot: { entries: [...without, nextEntry] }, launchIds: [] };
}

export function enqueueReadyMusicUploads(
  snapshot: MusicQueueSnapshot,
  orderedAudioIds: readonly string[],
): MusicQueueStep {
  const readyIds = new Set(
    snapshot.entries
      .filter((entry) => entry.phase === "ready")
      .map((entry) => entry.audioId),
  );
  const queuedOrder = orderedAudioIds.filter((audioId) => readyIds.has(audioId));
  const untouched = snapshot.entries.filter((entry) => !readyIds.has(entry.audioId));
  const queued = queuedOrder.map((audioId) => {
    const entry = snapshot.entries.find((item) => item.audioId === audioId)!;
    return { ...entry, phase: "queued" as const, errorMessage: undefined };
  });
  const filled = fillSlots([...untouched, ...queued]);
  return { snapshot: { entries: filled.entries }, launchIds: filled.launchIds };
}

export function retryMusicUpload(
  snapshot: MusicQueueSnapshot,
  audioId: string,
): MusicQueueStep {
  const entry = musicQueueEntry(snapshot, audioId);
  if (!entry || entry.phase !== "error") {
    return { snapshot, launchIds: [] };
  }
  const queued = snapshot.entries.map((item) =>
    item.audioId === audioId
      ? { ...item, phase: "queued" as const, errorMessage: undefined }
      : item,
  );
  const filled = fillSlots(queued);
  return { snapshot: { entries: filled.entries }, launchIds: filled.launchIds };
}

export function finishMusicUpload(
  snapshot: MusicQueueSnapshot,
  audioId: string,
  generation: number,
  errorMessage?: string,
): MusicQueueStep & { ignored: boolean } {
  const entry = musicQueueEntry(snapshot, audioId);
  if (!entry || entry.generation !== generation || entry.phase !== "uploading") {
    return { snapshot, launchIds: [], ignored: true };
  }
  const remaining = errorMessage
    ? snapshot.entries.map((item) =>
        item.audioId === audioId
          ? { ...item, phase: "error" as const, errorMessage }
          : item,
      )
    : snapshot.entries.filter((item) => item.audioId !== audioId);
  const filled = fillSlots(remaining);
  return {
    snapshot: { entries: filled.entries },
    launchIds: filled.launchIds,
    ignored: false,
  };
}

export function dropMusicUpload(
  snapshot: MusicQueueSnapshot,
  audioId: string,
): MusicQueueStep & { generation: number | null; wasUploading: boolean } {
  const entry = musicQueueEntry(snapshot, audioId);
  if (!entry) {
    return { snapshot, launchIds: [], generation: null, wasUploading: false };
  }
  const remaining = snapshot.entries.filter((item) => item.audioId !== audioId);
  const filled = fillSlots(remaining);
  return {
    snapshot: { entries: filled.entries },
    launchIds: filled.launchIds,
    generation: entry.generation,
    wasUploading: entry.phase === "uploading",
  };
}

export function retargetMusicUpload(
  snapshot: MusicQueueSnapshot,
  fromAudioId: string,
  toAudioId: string,
): MusicQueueSnapshot {
  if (fromAudioId === toAudioId || !musicQueueEntry(snapshot, fromAudioId)) {
    return snapshot;
  }
  return {
    entries: snapshot.entries.map((entry) =>
      entry.audioId === fromAudioId ? { ...entry, audioId: toAudioId } : entry,
    ),
  };
}
