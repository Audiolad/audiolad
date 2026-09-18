import {
  captureStudioRenderBootRelease,
  compareStudioRenderRelease,
  type StudioRenderReleaseComparison,
  type StudioRenderReleaseIdentity,
} from "@/lib/studio/render/worker-release";

export type ProductAudioNormalizeReleaseComparison = StudioRenderReleaseComparison;
export type ProductAudioNormalizeReleaseIdentity = StudioRenderReleaseIdentity;

export const captureProductAudioNormalizeBootRelease = captureStudioRenderBootRelease;

export function compareProductAudioNormalizeRelease(options: {
  boot: ProductAudioNormalizeReleaseIdentity;
  currentLinkPath?: string;
  env?: NodeJS.Dict<string>;
}): Promise<ProductAudioNormalizeReleaseComparison> {
  return compareStudioRenderRelease(options);
}

export function formatProductAudioNormalizeWorkerBootLog(
  comparison: ProductAudioNormalizeReleaseComparison,
): string {
  return JSON.stringify({
    event: "product_audio_normalize_worker_boot",
    bootReleasePath: comparison.bootReleasePath,
    bootSha: comparison.bootSha,
    currentReleasePath: comparison.currentReleasePath,
    currentSha: comparison.currentSha,
    releaseState: comparison.state,
  });
}

export function formatProductAudioNormalizeReleaseMismatchLog(
  comparison: ProductAudioNormalizeReleaseComparison,
): string {
  return JSON.stringify({
    event: "product_audio_normalize_release_mismatch",
    bootSha: comparison.bootSha,
    currentSha: comparison.currentSha,
  });
}

export function formatProductAudioNormalizeReleaseUnavailableLog(reason: string): string {
  return JSON.stringify({
    event: "product_audio_normalize_release_guard_unavailable",
    reason,
  });
}
