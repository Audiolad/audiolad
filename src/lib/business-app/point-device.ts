/**
 * Paired venue device (cookie `al-point`). Browser-safe and pure.
 *
 * The device plays the music of the venue it was paired with. That is decided by the device
 * session alone: whichever account is signed in on this browser (another venue, a listener
 * account, or nobody) must not turn the venue player into the guest preview.
 */
import type { BusinessChromeAccess } from "@/lib/access-grants/access-line";
import type { WorkspacePageStatus } from "@/lib/business-workspace/model";

/** Where the device lands after the code is accepted. Rewritten to /business-app/music on the business host. */
export const POINT_DEVICE_PLAYER_PATH = "/music";

export type PointDeviceVenue = {
  locationId: string;
  organizationId: string;
  locationName: string;
};

/** /music: the venue device always gets the player; only a visitor with neither a session nor a device sees the guest preview. */
export function businessMusicRoute(input: { signedIn: boolean; pointDevice: boolean }): "player" | "guest" {
  return input.pointDevice || input.signedIn ? "player" : "guest";
}

/**
 * Home on the venue device. When the signed-in account manages this same venue the usual
 * Home stays (it already has the device controls). Otherwise the device opens the venue player.
 */
export function pointDeviceHomeRedirect(
  point: Pick<PointDeviceVenue, "locationId"> | null,
  signedInLocationId: string | null,
): string | null {
  if (!point) return null;
  return signedInLocationId === point.locationId ? null : POINT_DEVICE_PLAYER_PATH;
}

/** The venue owner's gift or paid period, as the device's workspace status. */
export function pointDeviceWorkspaceAccess(access: BusinessChromeAccess): {
  status: WorkspacePageStatus;
  endsAt: string | null;
  playbackUntil: string | null;
} {
  const status: WorkspacePageStatus = access.mode === "none" ? "unavailable" : access.mode;
  const endsAt = access.endsAt ?? null;
  const playbackUntil = access.mode === "grace" ? access.graceEndsAt ?? endsAt : endsAt;
  return { status, endsAt, playbackUntil };
}
