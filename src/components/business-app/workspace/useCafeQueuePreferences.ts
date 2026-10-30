"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { coffeeStorage } from "@/lib/business-app/shared-coffee-storage";

import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { GUEST_COFFEE_DEFAULT_PROFILE, type GuestCoffeeProfile } from "@/lib/business-app/guest-coffee/catalog";
import {
  BUSINESS_SOUND_PROFILE_STORAGE_KEY,
  parseBusinessSoundProfile,
  serializeBusinessSoundProfile,
} from "@/lib/business-app/sound-profile";
import {
  CAFE_DAYPART_HOURS_DEFAULT,
  CAFE_QUEUE_DEFAULT_PREFS,
  CAFE_QUEUE_FEEDBACK_KEY,
  CAFE_QUEUE_PREFS_KEY,
  cafeDaypartHoursKey,
  effectiveCafeDaypartAt,
  parseCafeDaypartHours,
  validateCafeDaypartHours,
  parseCafeQueueFeedback,
  parseCafeQueuePrefs,
  serializeCafeDaypartHours,
  serializeCafeQueuePrefs,
  voteCafeFeedback,
  type CafeDaypart,
  type CafeDaypartHours,
  type CafeDaypartMode,
  type CafeEnergyOffset,
  type CafeQueueFeedback,
  type CafeQueueFeedbackKind,
  type CafeQueuePrefs,
} from "@/lib/business-app/cafe-queue/prefs";

export type CafeQueuePreferenceSeed = {
  profile?: GuestCoffeeProfile;
  prefs?: CafeQueuePrefs;
  hours?: CafeDaypartHours;
};

export function useCafeQueuePreferences(seed?: CafeQueuePreferenceSeed | null) {
  const domain = useBusinessDomain();
  const locationId = domain.status === "authenticated" ? domain.location?.id ?? null : null;
  const [prefs, setPrefs] = useState(seed?.prefs ?? CAFE_QUEUE_DEFAULT_PREFS);
  const [feedback, setFeedback] = useState<CafeQueueFeedback[]>([]);
  const [profile, setProfile] = useState(seed?.profile ?? GUEST_COFFEE_DEFAULT_PROFILE);
  const [hours, setHours] = useState(seed?.hours ?? CAFE_DAYPART_HOURS_DEFAULT);
  const [minuteOfDay, setMinuteOfDay] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const seedRef = useRef(seed);

  useEffect(() => {
    const seeded = seedRef.current;
    if (seeded?.prefs || seeded?.hours || seeded?.profile) {
      if (seeded.prefs) {
        setPrefs(seeded.prefs);
        try {
          coffeeStorage.setItem(CAFE_QUEUE_PREFS_KEY, serializeCafeQueuePrefs(seeded.prefs));
        } catch {
          /* private mode keeps the server choice for this visit */
        }
      }
      if (seeded.hours) {
        setHours(seeded.hours);
        try {
          coffeeStorage.setItem(cafeDaypartHoursKey(locationId), serializeCafeDaypartHours(seeded.hours));
        } catch {
          /* private mode keeps the server windows for this visit */
        }
      }
      if (seeded.profile) {
        setProfile(seeded.profile);
        try {
          coffeeStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(seeded.profile));
        } catch {
          /* private mode keeps the server profile for this visit */
        }
      }
    } else {
      try {
        setPrefs(parseCafeQueuePrefs(coffeeStorage.getItem(CAFE_QUEUE_PREFS_KEY)));
      } catch {
        setPrefs(CAFE_QUEUE_DEFAULT_PREFS);
      }
      try {
        setFeedback(parseCafeQueueFeedback(window.sessionStorage.getItem(CAFE_QUEUE_FEEDBACK_KEY)));
      } catch {
        setFeedback([]);
      }
      try {
        setProfile(parseBusinessSoundProfile(coffeeStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY)));
      } catch {
        setProfile(GUEST_COFFEE_DEFAULT_PROFILE);
      }
      try {
        setHours(parseCafeDaypartHours(coffeeStorage.getItem(cafeDaypartHoursKey(locationId))));
      } catch {
        setHours(CAFE_DAYPART_HOURS_DEFAULT);
      }
    }
    const now = new Date();
    setMinuteOfDay(now.getHours() * 60 + now.getMinutes());
    setReady(true);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const clock = new Date();
      setMinuteOfDay(clock.getHours() * 60 + clock.getMinutes());
      try {
        setProfile(parseBusinessSoundProfile(coffeeStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY)));
      } catch {
        /* keep the profile already on screen */
      }
      try {
        setHours(parseCafeDaypartHours(coffeeStorage.getItem(cafeDaypartHoursKey(locationId))));
      } catch {
        /* keep the windows already on screen */
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [locationId]);

  const setDaypartMode = useCallback((daypartMode: CafeDaypartMode) => {
    setPrefs((prev) => {
      const next = { ...prev, daypartMode };
      try {
        coffeeStorage.setItem(CAFE_QUEUE_PREFS_KEY, serializeCafeQueuePrefs(next));
      } catch {
        /* private mode keeps the choice for this visit */
      }
      return next;
    });
  }, []);

  const setEnergyOffset = useCallback((energyOffset: CafeEnergyOffset) => {
    setPrefs((prev) => {
      const next = { ...prev, energyOffset };
      try {
        coffeeStorage.setItem(CAFE_QUEUE_PREFS_KEY, serializeCafeQueuePrefs(next));
      } catch {
        /* private mode keeps the choice for this visit */
      }
      return next;
    });
  }, []);

  const setDaypartHours = useCallback((next: CafeDaypartHours): string | null => {
    const error = validateCafeDaypartHours(next);
    if (error) return error;
    setHours(next);
    try {
      coffeeStorage.setItem(cafeDaypartHoursKey(locationId), serializeCafeDaypartHours(next));
    } catch {
      /* private mode keeps the windows for this visit */
    }
    return null;
  }, [locationId]);

  const vote = useCallback((audioItemId: string, kind: CafeQueueFeedbackKind) => {
    setFeedback((prev) => {
      const next = voteCafeFeedback(prev, audioItemId, kind);
      try {
        window.sessionStorage.setItem(CAFE_QUEUE_FEEDBACK_KEY, JSON.stringify(next));
      } catch {
        /* the vote still applies until the tab closes */
      }
      return next;
    });
  }, []);

  const effectiveDaypart: CafeDaypart | null = effectiveCafeDaypartAt(prefs.daypartMode, minuteOfDay, hours);

  return {
    ready,
    profile,
    prefs,
    feedback,
    hours,
    effectiveDaypart,
    setDaypartMode,
    setDaypartHours,
    setEnergyOffset,
    vote,
  };
}
