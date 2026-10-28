"use client";

import { useCallback, useEffect, useState } from "react";

import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { GUEST_COFFEE_DEFAULT_PROFILE, type GuestCoffeeProfile } from "@/lib/business-app/guest-coffee/catalog";
import {
  BUSINESS_SOUND_PROFILE_STORAGE_KEY,
  parseBusinessSoundProfile,
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
} from "@/lib/business-app/cafe-queue/prefs";

export function useCafeQueuePreferences() {
  const domain = useBusinessDomain();
  const locationId = domain.status === "authenticated" ? domain.location?.id ?? null : null;
  const [prefs, setPrefs] = useState(CAFE_QUEUE_DEFAULT_PREFS);
  const [feedback, setFeedback] = useState<CafeQueueFeedback[]>([]);
  const [profile, setProfile] = useState<GuestCoffeeProfile>(GUEST_COFFEE_DEFAULT_PROFILE);
  const [hours, setHours] = useState<CafeDaypartHours>(CAFE_DAYPART_HOURS_DEFAULT);
  const [minuteOfDay, setMinuteOfDay] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of device queue prefs after hydration */
    try {
      setPrefs(parseCafeQueuePrefs(window.localStorage.getItem(CAFE_QUEUE_PREFS_KEY)));
    } catch {
      setPrefs(CAFE_QUEUE_DEFAULT_PREFS);
    }
    try {
      setFeedback(parseCafeQueueFeedback(window.sessionStorage.getItem(CAFE_QUEUE_FEEDBACK_KEY)));
    } catch {
      setFeedback([]);
    }
    try {
      setProfile(parseBusinessSoundProfile(window.localStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY)));
    } catch {
      setProfile(GUEST_COFFEE_DEFAULT_PROFILE);
    }
    const now = new Date();
    setMinuteOfDay(now.getHours() * 60 + now.getMinutes());
    try {
      setHours(parseCafeDaypartHours(window.localStorage.getItem(cafeDaypartHoursKey(locationId))));
    } catch {
      setHours(CAFE_DAYPART_HOURS_DEFAULT);
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const clock = new Date();
      setMinuteOfDay(clock.getHours() * 60 + clock.getMinutes());
      try {
        setProfile(parseBusinessSoundProfile(window.localStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY)));
      } catch {
        /* keep the profile already on screen */
      }
      try {
        setHours(parseCafeDaypartHours(window.localStorage.getItem(cafeDaypartHoursKey(locationId))));
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
        window.localStorage.setItem(CAFE_QUEUE_PREFS_KEY, serializeCafeQueuePrefs(next));
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
        window.localStorage.setItem(CAFE_QUEUE_PREFS_KEY, serializeCafeQueuePrefs(next));
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
      window.localStorage.setItem(cafeDaypartHoursKey(locationId), serializeCafeDaypartHours(next));
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
