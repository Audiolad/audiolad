import type { MusicAnalyzerPassport } from "@/lib/music-analyzer-runs/passport";
import type { AlbumPassportDisplay } from "@/lib/music-passport/album-passport-display";

export type JazzRelaxTrackState =
  | "missing_audio"
  | "not_ready"
  | "queued"
  | "processing"
  | "ready"
  | "failed";

/** Track card for product mode. Provenance and raw JSON are not part of this payload. */
export type JazzRelaxProductTrackPassport = {
  filename: string;
  analyzedAt: string | null;
  passport: MusicAnalyzerPassport;
};

export type JazzRelaxPassportTrackView = {
  audioItemId: string;
  title: string;
  state: JazzRelaxTrackState;
  errorCode: string | null;
  passportVersionId: string | null;
  runId: string | null;
  productPassport: JazzRelaxProductTrackPassport | null;
};

export type JazzRelaxPassportView = {
  phase: "idle" | "running" | "partial" | "completed" | "failed";
  readyCount: number;
  totalCount: number;
  tracks: JazzRelaxPassportTrackView[];
  completedAlbumPassportVersionId: string | null;
  /** Frozen album row for this settled analysis. Null while a run is still in progress. */
  album: AlbumPassportDisplay | null;
  summary: string[];
  progressLabel: string;
};

export function jazzRelaxProgressLabel(readyCount: number, totalCount: number): string {
  return `Музыкальный паспорт: ${readyCount} из ${totalCount} треков готовы`;
}

export function buildJazzRelaxPassportView(input: {
  tracks: JazzRelaxPassportTrackView[];
  completedAlbumPassportVersionId: string | null;
  album: AlbumPassportDisplay | null;
  summary: string[];
}): JazzRelaxPassportView {
  const totalCount = input.tracks.length;
  const readyCount = input.tracks.filter((track) => track.state === "ready").length;
  const running = input.tracks.some((track) => (
    track.state === "queued" || track.state === "processing"
  ));
  const failedCount = input.tracks.filter((track) => track.state === "failed").length;
  const blocked = input.tracks.some((track) => (
    track.state === "missing_audio" || track.state === "not_ready"
  ));
  let phase: JazzRelaxPassportView["phase"] = "idle";
  if (running) {
    phase = "running";
  } else if (totalCount > 0 && readyCount === totalCount && input.completedAlbumPassportVersionId) {
    phase = "completed";
  } else if (failedCount > 0 && !blocked) {
    phase = failedCount === totalCount ? "failed" : "partial";
  } else if (readyCount > 0 || failedCount > 0) {
    phase = "partial";
  }
  return {
    phase,
    readyCount,
    totalCount,
    tracks: input.tracks,
    completedAlbumPassportVersionId: input.completedAlbumPassportVersionId,
    album: input.album,
    summary: input.summary,
    progressLabel: jazzRelaxProgressLabel(readyCount, totalCount),
  };
}
