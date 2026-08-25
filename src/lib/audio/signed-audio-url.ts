export type FetchSignedAudioUrlOptions = {
  audioItemId: string;
  sourceType?: "catalog" | "private_audio";
  listenApiBase: string;
  preview?: boolean;
  signal?: AbortSignal;
};

export type FetchSignedAudioUrlResult =
  | { ok: true; url: string }
  | { ok: false; aborted: true }
  | { ok: false; aborted: false; status: number | null; error?: string };

/**
 * Catalog: `${listenApiBase}/audio/${id}` (optional `?preview=1`).
 * Private library: `/api/my-library/private-audio/${id}/audio`.
 * Does not create an Audio element — URL fetch only.
 */
export async function fetchSignedAudioUrl(
  options: FetchSignedAudioUrlOptions,
): Promise<FetchSignedAudioUrlResult> {
  const {
    audioItemId,
    sourceType = "catalog",
    listenApiBase,
    preview = false,
    signal,
  } = options;

  try {
    const response =
      sourceType === "private_audio"
        ? await fetch(
            `/api/my-library/private-audio/${encodeURIComponent(audioItemId)}/audio`,
            {
              credentials: "same-origin",
              cache: "no-store",
              signal,
            },
          )
        : await fetch(
            `${listenApiBase}/audio/${audioItemId}${preview ? "?preview=1" : ""}`,
            {
              signal,
            },
          );

    const payload = (await response.json()) as {
      url?: string;
      error?: string;
    };

    if (!response.ok || !payload.url) {
      return {
        ok: false,
        aborted: false,
        status: response.status,
        error: payload.error,
      };
    }

    return { ok: true, url: payload.url };
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      return { ok: false, aborted: true };
    }

    return { ok: false, aborted: false, status: null };
  }
}

export function playErrorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: string }).name;
    return name ? String(name) : "unknown";
  }

  return "unknown";
}
