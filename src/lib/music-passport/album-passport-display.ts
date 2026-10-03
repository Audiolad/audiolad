import type {
  AlbumPassportDraft,
  AlbumPassportSource,
  LabelProfileItem,
} from "@/lib/music-passport/album-aggregate";

/**
 * Read-only view of one immutable `music_album_passports` row.
 * Labels, the BPM range, and disagreement are copied from that row.
 * Missing profiles stay empty. This module does not average a tempo,
 * choose a key, or fill a field the row does not store.
 */

export type AlbumPassportTrackRef = {
  audioItemId: string;
  state: "missing_audio" | "not_ready" | "queued" | "processing" | "ready" | "failed";
  passportVersionId: string | null;
};

export type AlbumBpmDisplay =
  | { kind: "single"; value: number }
  | { kind: "range"; min: number; max: number };

export type AlbumAmbiguityField =
  | "Темп"
  | "Тональность"
  | "Жанр"
  | "Стиль"
  | "Настроение"
  | "Инструменты";

export type AlbumAmbiguityItem = {
  field: AlbumAmbiguityField;
  values: string[];
};

export type AlbumPassportDisplay = {
  id: string;
  version: number;
  status: "completed" | "partial";
  statusLabel: "завершён" | "частично";
  analyzedTrackCount: number;
  genres: string[];
  styles: string[];
  moods: string[];
  instruments: string[];
  bpm: AlbumBpmDisplay | null;
  ambiguity: AlbumAmbiguityItem[];
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  if (rightSet.size !== right.length || new Set(left).size !== left.length) return false;
  return left.every((item) => rightSet.has(item));
}

export function albumPassportMatchesTracks(
  draft: Pick<AlbumPassportDraft, "status" | "sources">,
  tracks: AlbumPassportTrackRef[],
): boolean {
  if (draft.status !== "completed" && draft.status !== "partial") return false;
  if (tracks.length === 0) return false;
  if (tracks.some((track) => track.state !== "ready" && track.state !== "failed")) return false;
  const ready = tracks.flatMap((track) => (
    track.state === "ready" && track.passportVersionId
      ? [`${track.audioItemId}:${track.passportVersionId}`]
      : []
  ));
  if (ready.length !== tracks.filter((track) => track.state === "ready").length) return false;
  const failed = tracks
    .filter((track) => track.state === "failed")
    .map((track) => track.audioItemId);
  const sources = Array.isArray(draft.sources) ? draft.sources : [];
  if (sources.some((source) => source?.outcome !== "succeeded" && source?.outcome !== "failed")) {
    return false;
  }
  const succeeded = sources.flatMap((source) => succeededPair(source));
  const sourceFailed = sources.flatMap((source) => {
    if (source?.outcome !== "failed") return [];
    const audioId = text(source.audio_item_id);
    return audioId ? [audioId] : [];
  });
  if (draft.status === "completed" && failed.length > 0) return false;
  if (draft.status === "partial" && (failed.length === 0 || ready.length === 0)) return false;
  return sameSet(ready, succeeded) && sameSet(failed, sourceFailed);
}

function succeededPair(source: AlbumPassportSource): string[] {
  if (source?.outcome !== "succeeded") return [];
  const audioId = text(source.audio_item_id);
  const passportId = text(source.track_passport_version_id);
  return audioId && passportId ? [`${audioId}:${passportId}`] : [];
}

function readLabelItems(items: LabelProfileItem[] | undefined): Array<{ label: string; trackIds: string[] }> {
  if (!Array.isArray(items)) return [];
  const out: Array<{ label: string; trackIds: string[] }> = [];
  for (const item of items) {
    const label = text(item?.label);
    if (!label) continue;
    const trackIds = Array.isArray(item.track_passport_version_ids)
      ? item.track_passport_version_ids.flatMap((id) => {
        const value = text(id);
        return value ? [value] : [];
      })
      : [];
    out.push({ label, trackIds });
  }
  return out;
}

function uniqueLabels(items: Array<{ label: string }>): string[] {
  const labels: string[] = [];
  for (const item of items) {
    if (!labels.includes(item.label)) labels.push(item.label);
  }
  return labels;
}

function uniqueNumbers(values: number[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * Labels that are not on every succeeded track.
 * Equal sets are agreement, so this returns null and does not invent a conflict.
 */
function partialLabels(
  items: Array<{ label: string; trackIds: string[] }>,
  succeededIds: string[],
): string[] | null {
  if (succeededIds.length < 2 || items.length === 0) return null;
  if (items.some((item) => item.trackIds.length === 0)) return null;
  const signatures = succeededIds.map((id) => (
    items.filter((item) => item.trackIds.includes(id)).map((item) => item.label).join("\0")
  ));
  if (new Set(signatures).size <= 1) return null;
  const values = uniqueLabels(
    items.filter((item) => succeededIds.some((id) => !item.trackIds.includes(id))),
  );
  return values.length > 0 ? values : null;
}

function readBpm(draft: AlbumPassportDraft): { bpm: AlbumBpmDisplay | null; values: number[] } {
  const published = draft.bpmProfile?.published;
  if (!published) return { bpm: null, values: [] };
  const values = Array.isArray(published.values)
    ? published.values.flatMap((item) => {
      const value = finite(item?.value);
      return value == null ? [] : [value];
    })
    : [];
  const min = finite(published.min);
  const max = finite(published.max);
  if (min == null || max == null) return { bpm: null, values };
  if (min === max) return { bpm: { kind: "single", value: min }, values };
  return { bpm: { kind: "range", min, max }, values };
}

function tempoAmbiguity(bpm: AlbumBpmDisplay | null, values: number[]): string[] | null {
  const unique = uniqueNumbers(values);
  if (bpm?.kind === "range") {
    return unique.length > 1 ? unique.map(String) : [String(bpm.min), String(bpm.max)];
  }
  return unique.length > 1 ? unique.map(String) : null;
}

function readKeys(draft: AlbumPassportDraft): string[] {
  const published = draft.keyProfile?.published;
  if (!Array.isArray(published)) return [];
  const out: string[] = [];
  for (const item of published) {
    const key = text(item?.key);
    if (!key) continue;
    const mode = text(item?.mode);
    const label = mode === "major" || mode === "minor" ? `${key} ${mode}` : key;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

function succeededPassportIds(sources: AlbumPassportSource[]): string[] {
  const ids: string[] = [];
  for (const source of sources ?? []) {
    if (source?.outcome !== "succeeded") continue;
    const id = text(source.track_passport_version_id);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function readAlbumPassportDisplay(input: {
  id: string;
  version: number;
  draft: AlbumPassportDraft;
}): AlbumPassportDisplay | null {
  if (input.draft.status !== "completed" && input.draft.status !== "partial") return null;
  const id = text(input.id);
  if (!id || !Number.isInteger(input.version) || input.version < 1) return null;
  const succeededIds = succeededPassportIds(input.draft.sources);
  if (succeededIds.length === 0) return null;
  const genres = readLabelItems(input.draft.genreProfile?.items);
  const styles = readLabelItems(input.draft.styleProfile?.items);
  const moods = readLabelItems(input.draft.moodProfile?.items);
  const instruments = readLabelItems(input.draft.instrumentProfile?.items);
  const bpmRead = readBpm(input.draft);
  const ambiguity: AlbumAmbiguityItem[] = [];
  const tempo = tempoAmbiguity(bpmRead.bpm, bpmRead.values);
  if (tempo) ambiguity.push({ field: "Темп", values: tempo });
  const keys = readKeys(input.draft);
  if (keys.length > 1) ambiguity.push({ field: "Тональность", values: keys });
  const genreGap = partialLabels(genres, succeededIds);
  if (genreGap) ambiguity.push({ field: "Жанр", values: genreGap });
  const styleGap = partialLabels(styles, succeededIds);
  if (styleGap) ambiguity.push({ field: "Стиль", values: styleGap });
  const moodGap = partialLabels(moods, succeededIds);
  if (moodGap) ambiguity.push({ field: "Настроение", values: moodGap });
  const instrumentGap = partialLabels(instruments, succeededIds);
  if (instrumentGap) ambiguity.push({ field: "Инструменты", values: instrumentGap });
  return {
    id,
    version: input.version,
    status: input.draft.status,
    statusLabel: input.draft.status === "completed" ? "завершён" : "частично",
    analyzedTrackCount: succeededIds.length,
    genres: uniqueLabels(genres),
    styles: uniqueLabels(styles),
    moods: uniqueLabels(moods),
    instruments: uniqueLabels(instruments),
    bpm: bpmRead.bpm,
    ambiguity,
  };
}
