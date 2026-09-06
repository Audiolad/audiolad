export type LocalStudioPlaybackAsset = {
  playbackUrl: string;
  duration: number;
  ownsObjectUrl: true;
};

export function isStudioObjectUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("blob:");
}

export function createStudioObjectUrl(file: Blob): string {
  return URL.createObjectURL(file);
}

export function revokeStudioObjectUrl(url: string | null | undefined): void {
  if (isStudioObjectUrl(url)) {
    URL.revokeObjectURL(url);
  }
}

export function readHtmlMediaDuration(
  media: Pick<HTMLMediaElement, "duration">,
): number | null {
  const duration = media.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  return duration;
}

export async function waitForStudioMediaMetadata(
  media: HTMLMediaElement,
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const haveMetadata =
    typeof HTMLMediaElement !== "undefined" ? HTMLMediaElement.HAVE_METADATA : 1;
  const existing = readHtmlMediaDuration(media);
  if (existing !== null && media.readyState >= haveMetadata) {
    return existing;
  }

  return new Promise<number>((resolve, reject) => {
    const cleanup = () => {
      media.removeEventListener("loadedmetadata", onReady);
      media.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onReady = () => {
      cleanup();
      const duration = readHtmlMediaDuration(media);
      if (duration === null) {
        reject(new Error("invalid audio duration"));
        return;
      }
      resolve(duration);
    };
    const onError = () => {
      cleanup();
      reject(new Error("media_metadata_error"));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    media.addEventListener("loadedmetadata", onReady);
    media.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    }
  });
}

export function releaseStudioMediaElement(media: HTMLMediaElement): void {
  media.pause();
  media.removeAttribute("src");
  media.removeAttribute("srcObject");
  media.load();
}

export async function createLocalStudioPlaybackAsset(
  file: File,
  {
    createAudio = () => {
      const audio = new Audio();
      audio.preload = "metadata";
      return audio;
    },
    signal,
  }: {
    createAudio?: () => HTMLAudioElement;
    signal?: AbortSignal;
  } = {},
): Promise<LocalStudioPlaybackAsset> {
  const playbackUrl = createStudioObjectUrl(file);
  const probe = createAudio();
  probe.preload = "metadata";
  try {
    probe.src = playbackUrl;
    const duration = await waitForStudioMediaMetadata(probe, signal);
    return {
      playbackUrl,
      duration,
      ownsObjectUrl: true,
    };
  } catch (error) {
    revokeStudioObjectUrl(playbackUrl);
    throw error;
  } finally {
    releaseStudioMediaElement(probe);
  }
}
