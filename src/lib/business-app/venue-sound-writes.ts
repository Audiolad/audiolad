import type { GuestCoffeeProfile } from "@/lib/business-app/guest-coffee/catalog";

/**
 * Venue sound writes from this tab, shared by every BusinessPlayerSettings instance.
 *
 * The builder in «Управление кофейней» unmounts when the panel is collapsed or the owner
 * leaves the page, while its save may still be in flight. Writes for one venue therefore go
 * through one chain per tab, and the last atmosphere this tab saved is remembered with its
 * settings version, so a later daypart or hours save never puts the previous atmosphere back.
 */
type VenueWrites = {
  chain: Promise<unknown>;
  profile: GuestCoffeeProfile | null;
  version: number;
};

const venues = new Map<string, VenueWrites>();

function entry(locationId: string): VenueWrites {
  let found = venues.get(locationId);
  if (!found) {
    found = { chain: Promise.resolve(), profile: null, version: 0 };
    venues.set(locationId, found);
  }
  return found;
}

/** Runs `run` after every earlier write for this venue in this tab, even a failed one. */
export function serialVenueWrite<T>(locationId: string, run: () => Promise<T>): Promise<T> {
  const venue = entry(locationId);
  const next = venue.chain.then(run, run);
  venue.chain = next.catch(() => undefined);
  return next;
}

/** A save succeeded: remember which atmosphere the venue row holds now. */
export function recordVenueSound(locationId: string, profile: GuestCoffeeProfile, version: number): void {
  const venue = entry(locationId);
  if (!Number.isFinite(version) || version < venue.version) return;
  venue.profile = profile;
  venue.version = version;
}

/**
 * The atmosphere a daypart or hours save must keep: what this tab saved last,
 * unless the page was rendered from a newer venue row (another device changed it since).
 */
export function latestVenueProfile(
  locationId: string,
  fallback: GuestCoffeeProfile,
  fallbackVersion: number,
): { profile: GuestCoffeeProfile; known: boolean } {
  const venue = venues.get(locationId);
  if (venue?.profile && venue.version > fallbackVersion) return { profile: venue.profile, known: true };
  return { profile: fallback, known: false };
}

/** Tests only. */
export function resetVenueSoundWrites(): void {
  venues.clear();
}
