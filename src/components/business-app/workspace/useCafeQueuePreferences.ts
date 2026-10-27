"use client";

import { useCallback, useEffect, useState } from "react";

import { GUEST_COFFEE_DEFAULT_PROFILE, type GuestCoffeeProfile } from "@/lib/business-app/guest-coffee/catalog";
import {
  BUSINESS_SOUND_PROFILE_STORAGE_KEY,
  parseBusinessSoundProfile,
} from "@/lib/business-app/sound-profile";
import {
  CAFE_QUEUE_DEFAULT_PREFS,
  CAFE_QUEUE_FEEDBACK_KEY,
  CAFE_QUEUE_PREFS_KEY,
  effectiveCafeDaypart,
  parseCafeQueueFeedback,
  parseCafeQueuePrefs,
  serializeCafeQueuePrefs,
  voteCafeFeedback,
  type CafeDaypart,
  type CafeDaypartMode,
  type CafeEnergyOffset,
  type CafeQueueFeedback,
  type CafeQueueFeedbackKind,
} from "@/lib/business-app/cafe-queue/prefs";

export function useCafeQueuePreferences() {
  const [prefs, setPrefs] = useState(CAFE_QUEUE_DEFAULT_PREFS);
  const [feedback, setFeedback] = useState<CafeQueueFeedback[]>([]);
  const [profile, setProfile] = useState<GuestCoffeeProfile>(GUEST_COFFEE_DEFAULT_PROFILE);
  const [hour, setHour] = useState<number | null>(null);
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
    setHour(new Date().getHours());
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setHour(new Date().getHours());
      try {
        setProfile(parseBusinessSoundProfile(window.localStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY)));
      } catch {
        /* keep the profile already on screen */
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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

  const effectiveDaypart: CafeDaypart | null = effectiveCafeDaypart(prefs.daypartMode, hour);

  return {
    ready,
    profile,
    prefs,
    feedback,
    effectiveDaypart,
    setDaypartMode,
    setEnergyOffset,
    vote,
  };
}
