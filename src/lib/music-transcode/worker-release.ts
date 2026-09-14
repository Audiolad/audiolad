import {
  captureStudioRenderBootRelease,
  compareStudioRenderRelease,
  type StudioRenderReleaseComparison,
  type StudioRenderReleaseIdentity,
} from "@/lib/studio/render/worker-release";

export type MusicTranscodeReleaseComparison = StudioRenderReleaseComparison;
export type MusicTranscodeReleaseIdentity = StudioRenderReleaseIdentity;

export const captureMusicTranscodeBootRelease = captureStudioRenderBootRelease;

export function compareMusicTranscodeRelease(options: {
  boot: MusicTranscodeReleaseIdentity;
  currentLinkPath?: string;
  env?: NodeJS.Dict<string>;
}): Promise<MusicTranscodeReleaseComparison> {
  return compareStudioRenderRelease(options);
}

export function formatMusicTranscodeWorkerBootLog(
  comparison: MusicTranscodeReleaseComparison,
): string {
  return JSON.stringify({
    event: "music_transcode_worker_boot",
    bootReleasePath: comparison.bootReleasePath,
    bootSha: comparison.bootSha,
    currentReleasePath: comparison.currentReleasePath,
    currentSha: comparison.currentSha,
    releaseState: comparison.state,
  });
}

export function formatMusicTranscodeReleaseMismatchLog(
  comparison: MusicTranscodeReleaseComparison,
): string {
  return JSON.stringify({
    event: "music_transcode_release_mismatch",
    bootSha: comparison.bootSha,
    currentSha: comparison.currentSha,
  });
}

export function formatMusicTranscodeReleaseUnavailableLog(reason: string): string {
  return JSON.stringify({
    event: "music_transcode_release_guard_unavailable",
    reason,
  });
}
