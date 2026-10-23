import type { SpaManifestItem } from "@/lib/business-app/spa-manifest";
import type { BusinessSpaceId } from "./spaces";

export type WorkspaceTrack = {
  audioItemId: string;
  title: string;
  durationSeconds: number | null;
};

export type WorkspacePlaybackSnapshot = {
  index: number;
  positionSec: number;
  volume: number;
  updatedAt: string;
};

export type WorkspacePageStatus =
  | "anonymous"
  | "unconfirmed"
  | "unavailable"
  | "trial"
  | "paid"
  | "offer";

/**
 * Serializable view model for the one workspace component.
 * `player` is closed unless status is trial or paid AND the space is enabled.
 */
export type WorkspacePageModel = {
  spaceId: BusinessSpaceId;
  spaceTitle: string;
  spaceEnabled: boolean;
  status: WorkspacePageStatus;
  daysLeft: number | null;
  endsAtLabel: string | null;
  endsAt: string | null;
  priceLabel: string;
  periodLabel: string;
  rules: string;
  tracks: WorkspaceTrack[];
  playback: WorkspacePlaybackSnapshot | null;
  helpHref: string;
  rightsHref: string;
  onboardingHref: string;
  signUpHref: string;
  signInHref: string;
  cafeHref: string;
};

export function workspacePlayerOpen(model: Pick<WorkspacePageModel, "status" | "spaceEnabled">): boolean {
  return model.spaceEnabled && (model.status === "trial" || model.status === "paid");
}

/** The wire deadline is ISO; the SPA engine consumes Date instances. */
export function workspaceItems(tracks: readonly WorkspaceTrack[], endsAt: string | null): SpaManifestItem[] {
  return tracks.map((track, position) => ({
    position,
    audioItemId: track.audioItemId,
    trackCode: null,
    title: track.title,
    durationSeconds: track.durationSeconds,
    gainDb: null,
    playableUntil: endsAt ? new Date(endsAt) : null,
    offlineAllowed: false,
    offlineCacheUntil: null,
  }));
}

/** Fail closed for a missing/invalid window; split long waits below the browser cap. */
export function workspaceDeadlineDelay(endsAt: string | null, now: number): number {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  return Number.isFinite(end) ? Math.min(Math.max(0, end - now), 2 ** 31 - 1) : 0;
}

export function workspacePlaybackAllowed(endsAt: string | null, now: number): boolean {
  return endsAt !== null && Number.isFinite(Date.parse(endsAt)) && now < Date.parse(endsAt);
}
