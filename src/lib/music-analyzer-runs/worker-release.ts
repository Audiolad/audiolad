import {
  captureStudioRenderBootRelease,
  compareStudioRenderRelease,
  type StudioRenderReleaseComparison,
  type StudioRenderReleaseIdentity,
} from "@/lib/studio/render/worker-release";

export type MusicAnalyzerReleaseComparison = StudioRenderReleaseComparison;
export type MusicAnalyzerReleaseIdentity = StudioRenderReleaseIdentity;

export const captureMusicAnalyzerBootRelease = captureStudioRenderBootRelease;

export function compareMusicAnalyzerRelease(options: {
  boot: MusicAnalyzerReleaseIdentity;
  currentLinkPath?: string;
  env?: NodeJS.Dict<string>;
}): Promise<MusicAnalyzerReleaseComparison> {
  return compareStudioRenderRelease(options);
}

export function formatMusicAnalyzerWorkerBootLog(comparison: MusicAnalyzerReleaseComparison): string {
  return JSON.stringify({
    event: "music_analyzer_worker_boot",
    bootReleasePath: comparison.bootReleasePath,
    bootSha: comparison.bootSha,
    currentReleasePath: comparison.currentReleasePath,
    currentSha: comparison.currentSha,
    releaseState: comparison.state,
  });
}

export function formatMusicAnalyzerReleaseMismatchLog(comparison: MusicAnalyzerReleaseComparison): string {
  return JSON.stringify({
    event: "music_analyzer_release_mismatch",
    bootSha: comparison.bootSha,
    currentSha: comparison.currentSha,
  });
}

export function formatMusicAnalyzerReleaseUnavailableLog(reason: string): string {
  return JSON.stringify({
    event: "music_analyzer_release_guard_unavailable",
    reason,
  });
}
