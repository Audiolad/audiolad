export type VkPlaybackAudioClientResult =
  | { ok: true; url: string; objectUrl?: boolean }
  | { ok: false; reason: string };

/** Shared reader for VK playback audio responses. Preview is a clip, full play is a URL. */
export async function readVkPlaybackAudioResponse(
  response: Response,
): Promise<VkPlaybackAudioClientResult> {
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok && contentType.includes("audio/")) {
    const blob = await response.blob();
    return { ok: true, url: URL.createObjectURL(blob), objectUrl: true };
  }

  const payload = await response.json().catch(() => null);
  if (response.ok && typeof payload?.url === "string") {
    return { ok: true, url: payload.url };
  }

  return {
    ok: false,
    reason: typeof payload?.reason === "string" ? payload.reason : "error",
  };
}
