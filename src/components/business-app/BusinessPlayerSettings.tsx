"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  AtmosphereAssembling,
  ATMOSPHERE_REDUCED_MOTION_MS,
  ATMOSPHERE_STEP_MS,
  atmosphereAssemblingSteps,
  prefersReducedAtmosphereMotion,
} from "@/components/business-app/sound/AtmosphereAssembling";
import BusinessSoundSettings from "@/components/business-app/sound/BusinessSoundSettings";
import CafeDaypartHoursForm from "@/components/business-app/workspace/CafeDaypartHoursForm";
import CafeQueueControls from "@/components/business-app/workspace/CafeQueueControls";
import { useCabinetPlayerOptional } from "@/components/business-app/workspace/BusinessCabinetPlayer";
import { useCafeQueuePreferences } from "@/components/business-app/workspace/useCafeQueuePreferences";
import {
  GUEST_COFFEE_DEFAULT_PROFILE,
  GUEST_COFFEE_DIRECTIONS,
  type GuestCoffeeProfile,
} from "@/lib/business-app/guest-coffee/catalog";
import { clearAtmosphereRestart, markAtmosphereRestart } from "@/lib/business-app/cafe-queue/atmosphere-restart";
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
 * Guests keep the choice on the device only. Chips are stored immediately.
 * «Создать атмосферу» applies them to the live queue: sound type and venue
 * character change the mood rank, and the clock daypart changes the energy
 * target. The same album is not placed twice in a row.
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
  const player = useCabinetPlayerOptional();
  const [profile, setProfile] = useState<GuestCoffeeProfile>(seeded?.profile ?? GUEST_COFFEE_DEFAULT_PROFILE);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "assembling" | "done">("idle");
  const [step, setStep] = useState(0);
  const [steps, setSteps] = useState<string[]>([]);
  const timers = useRef<number[]>([]);
  const generation = useRef(0);
  const mounted = useRef(true);

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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
    };
  }, []);

  const clearTimers = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  const onChange = <K extends keyof GuestCoffeeProfile>(key: K, value: GuestCoffeeProfile[K]) => {
    const next = { ...profile, [key]: value };
    setProfile(next);
    generation.current += 1;
    player?.cancelAtmosphereRebuild();
    clearAtmosphereRestart();
    clearTimers();
    setPhase("idle");
    try {
      window.localStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(next));
    } catch {
      /* private mode keeps the choice for this visit */
    }
    void persist(next, queue.prefs.daypartMode, queue.hours).then((error) => setSaveError(error));
  };

  const createAtmosphere = () => {
    if (phase === "assembling" || !queue.effectiveDaypart) return;
    try {
      window.localStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(profile));
    } catch {
      /* the in-memory profile still goes to the player */
    }
    void persist(profile, queue.prefs.daypartMode, queue.hours).then((error) => setSaveError(error));
    const directionLabel = GUEST_COFFEE_DIRECTIONS.find((item) => item.id === profile.direction)?.label ?? "";
    const nextSteps = atmosphereAssemblingSteps(directionLabel);
    const reduced = prefersReducedAtmosphereMotion();
    const gen = ++generation.current;
    clearTimers();
    setSteps(nextSteps);
    setStep(0);
    setPhase("assembling");
    const stepMs = reduced ? ATMOSPHERE_REDUCED_MOTION_MS : ATMOSPHERE_STEP_MS;
    const total = reduced ? ATMOSPHERE_REDUCED_MOTION_MS : ATMOSPHERE_STEP_MS * nextSteps.length;
    if (!reduced) {
      for (let i = 1; i < nextSteps.length; i += 1) {
        timers.current.push(window.setTimeout(() => {
          if (generation.current === gen) setStep(i);
        }, stepMs * i));
      }
    }
    const playingNow = player?.view.status === "playing" || player?.view.status === "loading";
    markAtmosphereRestart(playingNow);
    const pending = player?.rebuildFromProfile({
      character: profile.character,
      direction: profile.direction,
      daypart: queue.effectiveDaypart,
      feedback: queue.feedback,
    }) ?? Promise.resolve("deferred" as const);
    timers.current.push(window.setTimeout(() => {
      void pending.then((result) => {
        if (!mounted.current || generation.current !== gen) return;
        if (result === "failed") {
          clearAtmosphereRestart();
          setPhase("idle");
          return;
        }
        setPhase("done");
      });
    }, total));
  };

  const action = (
    <div className="business-atmosphere-action">
      {phase === "idle" ? (
        <button
          type="button"
          className="business-app-btn business-app-btn-primary business-app-focus-ring business-atmosphere-assemble"
          onClick={createAtmosphere}
          data-testid="biz-create-atmosphere"
        >
          Создать атмосферу
        </button>
      ) : null}
      {phase === "assembling" ? <AtmosphereAssembling step={step} steps={steps} /> : null}
      {phase === "done" ? (
        <div className="business-app-card business-atmosphere-assembling" role="status" data-testid="biz-atmosphere-created">
          <p className="business-atmosphere-assembling__title">Атмосфера создана</p>
          <Link
            href="/music"
            className="business-app-btn business-app-btn-primary business-app-focus-ring business-atmosphere-assemble"
            data-testid="biz-atmosphere-open-player"
          >
            Перейти в плеер
          </Link>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <BusinessSoundSettings
        profile={profile}
        onChange={onChange}
        showDaypart={false}
        hint="Характер заведения и тип звучания учитываются в очереди. Время суток выбирается ниже, по часам этого устройства."
        action={action}
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
