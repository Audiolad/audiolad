"use client";

import { useEffect, useState } from "react";

import BusinessSoundSettings from "@/components/business-app/sound/BusinessSoundSettings";
import CafeDaypartHoursForm from "@/components/business-app/workspace/CafeDaypartHoursForm";
import CafeQueueControls from "@/components/business-app/workspace/CafeQueueControls";
import { useCafeQueuePreferences } from "@/components/business-app/workspace/useCafeQueuePreferences";
import {
  GUEST_COFFEE_DEFAULT_PROFILE,
  type GuestCoffeeProfile,
} from "@/lib/business-app/guest-coffee/catalog";
import {
  locationSoundDraftFromParts,
  locationSoundPrefs,
  locationSoundProfile,
  type LocationSoundSettings,
} from "@/lib/business-app/location-sound-settings";
import {
  BUSINESS_SOUND_PROFILE_STORAGE_KEY,
  parseBusinessSoundProfile,
  serializeBusinessSoundProfile,
} from "@/lib/business-app/sound-profile";
import type { CafeDaypartHours, CafeDaypartMode } from "@/lib/business-app/cafe-queue/prefs";

const SAVE_ERROR = "Не удалось сохранить звучание. Попробуйте ещё раз.";

/**
 * Sound choices for this cabinet. A saved venue row wins over this browser.
 * Guests keep the choice on the device only.
 */
export default function BusinessPlayerSettings({
  locationId = null,
  saved = null,
}: {
  locationId?: string | null;
  saved?: LocationSoundSettings | null;
}) {
  const seeded = saved
    ? {
        profile: locationSoundProfile(saved),
        prefs: locationSoundPrefs(saved),
        hours: saved.hours,
      }
    : null;
  const queue = useCafeQueuePreferences(seeded);
  const [profile, setProfile] = useState<GuestCoffeeProfile>(seeded?.profile ?? GUEST_COFFEE_DEFAULT_PROFILE);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (saved) {
      const next = locationSoundProfile(saved);
      try {
        window.localStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(next));
      } catch {
        /* private mode keeps the server profile for this visit */
      }
      return;
    }
    let next = GUEST_COFFEE_DEFAULT_PROFILE;
    try {
      next = parseBusinessSoundProfile(window.localStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY));
    } catch {
      next = GUEST_COFFEE_DEFAULT_PROFILE;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the device sound profile after hydration
    setProfile(next);
  }, [saved]);

  const persist = async (nextProfile: GuestCoffeeProfile, daypartMode: CafeDaypartMode, hours: CafeDaypartHours) => {
    if (!locationId) return null;
    try {
      const { saveLocationSoundSettings } = await import("@/app/business-app/sound-settings-actions");
      const result = await saveLocationSoundSettings(
        locationId,
        locationSoundDraftFromParts(nextProfile, { ...queue.prefs, daypartMode }, hours),
      );
      if (!result.ok) return result.error;
      return null;
    } catch {
      return SAVE_ERROR;
    }
  };

  const onChange = <K extends keyof GuestCoffeeProfile>(key: K, value: GuestCoffeeProfile[K]) => {
    const next = { ...profile, [key]: value };
    setProfile(next);
    try {
      window.localStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(next));
    } catch {
      /* private mode keeps the choice for this visit */
    }
    void persist(next, queue.prefs.daypartMode, queue.hours).then((error) => setSaveError(error));
  };

  return (
    <>
      <BusinessSoundSettings
        profile={profile}
        onChange={onChange}
        showDaypart={false}
        hint="Характер заведения и тип звучания учитываются в очереди. Время суток выбирается ниже, по часам этого устройства."
      />
      {saveError ? (
        <p className="business-app-alert" data-tone="warn" role="alert" data-testid="biz-sound-save-error">{saveError}</p>
      ) : null}
      <section className="business-app-card space-y-3">
        <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Очередь</h2>
        <CafeQueueControls
          mode={queue.prefs.daypartMode}
          effectiveDaypart={queue.effectiveDaypart}
          onDaypart={(mode) => {
            queue.setDaypartMode(mode);
            void persist(profile, mode, queue.hours).then((error) => setSaveError(error));
          }}
          hours={queue.hours}
        />
      </section>
      <section className="business-app-card space-y-3">
        <CafeDaypartHoursForm
          hours={queue.hours}
          onSave={async (next) => {
            const invalid = queue.setDaypartHours(next);
            if (invalid) return invalid;
            return persist(profile, queue.prefs.daypartMode, next);
          }}
        />
      </section>
    </>
  );
}
