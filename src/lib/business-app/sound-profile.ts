/**
 * a8240527 – device-level storage of the Music section sound settings (character, direction,
 * time of day). No personal data: three option ids. The same key is read by the guest and,
 * after the point is created on this device, by the owner – the guest's choice carries over.
 * Saving the settings as a server-side parameter of the point needs a DB migration
 * (Sergey's sanction) and is a later phase.
 */
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DEFAULT_PROFILE,
  GUEST_COFFEE_DIRECTIONS,
  isGuestCoffeeProfileValue,
  type GuestCoffeeProfile,
} from "./guest-coffee/catalog";

export const BUSINESS_SOUND_PROFILE_STORAGE_KEY = "audiolad-business-sound-profile";

/** Settings saved before the passport stage used the old genre directions. */
const LEGACY_DIRECTIONS: Record<string, GuestCoffeeProfile["direction"]> = { bossa: "rhythm", sax: "jazz" };

export function parseBusinessSoundProfile(raw: string | null | undefined): GuestCoffeeProfile {
  if (!raw) return GUEST_COFFEE_DEFAULT_PROFILE;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.direction === "string" && v.direction in LEGACY_DIRECTIONS) v.direction = LEGACY_DIRECTIONS[v.direction];
    return {
      character: isGuestCoffeeProfileValue(GUEST_COFFEE_CHARACTERS, v.character) ? v.character : GUEST_COFFEE_DEFAULT_PROFILE.character,
      direction: isGuestCoffeeProfileValue(GUEST_COFFEE_DIRECTIONS, v.direction) ? v.direction : GUEST_COFFEE_DEFAULT_PROFILE.direction,
      daypart: isGuestCoffeeProfileValue(GUEST_COFFEE_DAYPARTS, v.daypart) ? v.daypart : GUEST_COFFEE_DEFAULT_PROFILE.daypart,
    };
  } catch {
    return GUEST_COFFEE_DEFAULT_PROFILE;
  }
}

export function serializeBusinessSoundProfile(profile: GuestCoffeeProfile): string {
  return JSON.stringify({ character: profile.character, direction: profile.direction, daypart: profile.daypart });
}
