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
