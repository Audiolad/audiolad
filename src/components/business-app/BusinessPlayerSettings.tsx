"use client";

import { useEffect, useState } from "react";

import BusinessSoundSettings from "@/components/business-app/sound/BusinessSoundSettings";
import {
  GUEST_COFFEE_DEFAULT_PROFILE,
  type GuestCoffeeProfile,
} from "@/lib/business-app/guest-coffee/catalog";
import {
  BUSINESS_SOUND_PROFILE_STORAGE_KEY,
  parseBusinessSoundProfile,
  serializeBusinessSoundProfile,
} from "@/lib/business-app/sound-profile";

/**
 * Sound choices the cabinet player already reads from this device.
 * The sound type picks the starting shelf when no saved place exists.
 * Character and time of day are the other two stored axes of the same profile.
 */
export default function BusinessPlayerSettings() {
  const [profile, setProfile] = useState<GuestCoffeeProfile>(GUEST_COFFEE_DEFAULT_PROFILE);

  useEffect(() => {
    let next = GUEST_COFFEE_DEFAULT_PROFILE;
    try {
      next = parseBusinessSoundProfile(window.localStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY));
    } catch {
      next = GUEST_COFFEE_DEFAULT_PROFILE;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the device sound profile after hydration
    setProfile(next);
  }, []);

  const onChange = <K extends keyof GuestCoffeeProfile>(key: K, value: GuestCoffeeProfile[K]) => {
    const next = { ...profile, [key]: value };
    setProfile(next);
    try {
      window.localStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(next));
    } catch {
      /* private mode keeps the choice for this visit */
    }
  };

  return (
    <BusinessSoundSettings
      profile={profile}
      onChange={onChange}
      hint="Тип звучания выбирает, с какой подборки начнётся плеер, если место в подборке ещё не сохранено. Характер заведения и время суток запоминаются на этом устройстве."
    />
  );
}
