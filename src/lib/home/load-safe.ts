import {
  EMPTY_GUEST_HOME_DATA,
  EMPTY_PERSONAL_HOME_DATA,
  safeHomeSection,
} from "./safe";
import type { GuestHomeData, PersonalHomeData } from "./types";

export { EMPTY_GUEST_HOME_DATA, EMPTY_PERSONAL_HOME_DATA };

export async function loadGuestHomeDataSafe(
  loader: () => Promise<GuestHomeData>,
): Promise<GuestHomeData> {
  return safeHomeSection("guest_home", loader, {
    ...EMPTY_GUEST_HOME_DATA,
    freeProducts: [],
    newProducts: [],
    programProducts: [],
    authors: [],
  });
}

export async function loadPersonalHomeDataSafe(
  loader: () => Promise<PersonalHomeData>,
): Promise<PersonalHomeData> {
  return safeHomeSection("personal_home", loader, {
    ...EMPTY_PERSONAL_HOME_DATA,
    startSuggestions: [],
    forYouProducts: [],
    recentlyListened: [],
    activePrograms: [],
    newProducts: [],
    authors: [],
  });
}
