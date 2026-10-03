import "server-only";

import {
  buildMaxPlaybackPreviewClip,
  getMaxPlaybackSession,
  signMaxPlaybackAudio,
  type GetMaxPlaybackSessionResult,
} from "@/lib/max/playback";
import type { MaxPlaybackSession } from "@/lib/max/playback-types";
import type { VkProductRef } from "@/lib/vk/request";
import { resolveVkProductRef } from "@/lib/vk/resolve-target";

type VkPlaybackDeps = {
  getSession?: typeof getMaxPlaybackSession;
  signAudio?: typeof signMaxPlaybackAudio;
  buildPreview?: typeof buildMaxPlaybackPreviewClip;
};

let playbackDeps: VkPlaybackDeps | null = null;

export function setVkPlaybackDepsForTests(deps: VkPlaybackDeps | null) {
  playbackDeps = deps;
}

function sanitizeSession(session: MaxPlaybackSession): MaxPlaybackSession {
  return {
    authorSlug: session.authorSlug,
    productSlug: session.productSlug,
    title: session.title,
    authorName: session.authorName,
    formatLabel: session.formatLabel,
    coverUrl: session.coverUrl,
    playbackMode: session.playbackMode,
    tracks: session.tracks.map((track) => ({
      trackId: track.trackId,
      title: track.title,
      position: track.position,
      durationSeconds: track.durationSeconds,
      coverUrl: track.coverUrl,
    })),
  };
}

export async function loadVkPlaybackSession(
  token: string,
): Promise<GetMaxPlaybackSessionResult> {
  return loadVkPlaybackSessionRef({ kind: "token", token });
}

export async function loadVkPlaybackSessionRef(
  ref: VkProductRef,
): Promise<GetMaxPlaybackSessionResult> {
  const resolved = await resolveVkProductRef(ref);
  if (!resolved.ok) return { ok: false, reason: "storage_unavailable" };
  if (!resolved.target) return { ok: false, reason: "not_found" };

  const getSession = playbackDeps?.getSession ?? getMaxPlaybackSession;
  const session = await getSession(
    null,
    resolved.target.authorSlug,
    resolved.target.productSlug,
  );
  if (!session.ok) return session;

  const safe = sanitizeSession(session.session);
  if (session.playbackMode === "preview") {
    return {
      ok: true,
      playbackMode: "preview",
      session: safe,
      previewDurationSeconds: session.previewDurationSeconds,
    };
  }
  return { ok: true, playbackMode: "full", session: safe };
}

export type LoadVkPlaybackAudioFailure =
  | "not_found"
  | "access_required"
  | "preview_unavailable"
  | "no_audio"
  | "storage_unavailable"
  | "forbidden"
  | "audio_missing"
  | "sign_failed";

export type LoadVkPlaybackAudioResult =
  | { ok: true; kind: "url"; url: string; expiresIn: number }
  | { ok: true; kind: "clip"; bytes: Uint8Array }
  | { ok: false; reason: LoadVkPlaybackAudioFailure };

export async function loadVkPlaybackAudio(
  token: string,
  trackId: string,
): Promise<LoadVkPlaybackAudioResult> {
  return loadVkPlaybackAudioRef({ kind: "token", token }, trackId);
}

export async function loadVkPlaybackAudioRef(
  ref: VkProductRef,
  trackId: string,
): Promise<LoadVkPlaybackAudioResult> {
  const resolved = await resolveVkProductRef(ref);
  if (!resolved.ok) return { ok: false, reason: "storage_unavailable" };
  if (!resolved.target) return { ok: false, reason: "not_found" };

  const getSession = playbackDeps?.getSession ?? getMaxPlaybackSession;
  const session = await getSession(
    null,
    resolved.target.authorSlug,
    resolved.target.productSlug,
  );
  if (!session.ok) return { ok: false, reason: session.reason };
  if (!session.session.tracks.some((track) => track.trackId === trackId)) {
    return { ok: false, reason: "forbidden" };
  }

  if (session.playbackMode === "preview") {
    const buildPreview = playbackDeps?.buildPreview ?? buildMaxPlaybackPreviewClip;
    const clip = await buildPreview(
      resolved.target.authorSlug,
      resolved.target.productSlug,
      trackId,
    );
    if (!clip.ok) return { ok: false, reason: clip.reason };
    return { ok: true, kind: "clip", bytes: clip.bytes };
  }

  const signAudio = playbackDeps?.signAudio ?? signMaxPlaybackAudio;
  const signed = await signAudio(
    null,
    resolved.target.authorSlug,
    resolved.target.productSlug,
    trackId,
  );
  if (!signed.ok) return { ok: false, reason: signed.reason };
  return { ok: true, kind: "url", url: signed.url, expiresIn: signed.expiresIn };
}
