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
import VenueConfirmDialog from "@/components/business-app/VenueConfirmDialog";
import { POINT_MUSIC_FORBIDDEN } from "@/lib/business-app/point-sound";
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
import { validateCafeDaypartHours, type CafeDaypartHours, type CafeDaypartMode } from "@/lib/business-app/cafe-queue/prefs";
import { POINT_SOUND_CHANGED_EVENT } from "@/lib/business-app/point-sound";

const SAVE_ERROR = "Не удалось сохранить звучание. Попробуйте ещё раз.";

/**
 * Sound choices for this cabinet. A saved venue row wins over this browser.
 * Guests keep the choice on the device only. Chips are stored immediately.
 * «Создать атмосферу» applies them to the live queue: sound type and venue
 * character change the mood rank, and the clock daypart changes the energy
 * target. The same album is not placed twice in a row.
 */
const VENUE_SOUND_CONFIRM = "Применить это звучание в зале со следующего трека?";
const VENUE_SEND_CONFIRM = "Отправить это звучание в кофейню? В зале оно начнётся со следующего трека.";
const VENUE_SENT = "Отправлено. В кофейне новое звучание начнётся со следующего трека.";

/** Where the owner turns venue-device music changes back on. En dash only. */
function PointSoundLockedHow() {
  return (
    <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-point-sound-locked-how">
      Это включается на телефоне владельца, не на этом устройстве: «Настройка» – «Управление кофейней», галочка «Разрешить менять музыку с устройства в заведении».
    </p>
  );
}

export default function BusinessPlayerSettings({
  locationId = null,
  saved = null,
  pointDevice = false,
  pointCanEdit = true,
}: {
  locationId?: string | null;
  saved?: LocationSoundSettings | null;
  /** This browser is the paired device. It cannot write when the owner turned that off. */
  pointDevice?: boolean;
  /** Server flag. Missing row stays allowed. */
  pointCanEdit?: boolean;
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
  const [confirm, setConfirm] = useState<{ text: string; run: () => void; cancel?: () => void } | null>(null);
  const [phase, setPhase] = useState<"idle" | "assembling" | "done">("idle");
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  /** Owner phone with a venue: chips and «Создать атмосферу» stay here until «Отправить в кофейню». */
  const venueOwner = Boolean(locationId) && !pointDevice;
  /** What the venue already has. Daypart and hours saves keep it, so unsent chips do not leak. */
  const venueProfile = useRef<GuestCoffeeProfile>(seeded?.profile ?? GUEST_COFFEE_DEFAULT_PROFILE);
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
    const draft = locationSoundDraftFromParts(nextProfile, { ...queue.prefs, daypartMode }, hours);
    try {
      if (pointDevice) {
        const res = await fetch("/api/business/point", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ action: "sound-save", locationId, ...draft }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        window.dispatchEvent(new Event(POINT_SOUND_CHANGED_EVENT));
        return json.ok === true ? null : json.error ?? SAVE_ERROR;
      }
      const { saveLocationSoundSettings } = await import("@/app/business-app/sound-settings-actions");
      const result = await saveLocationSoundSettings(locationId, draft);
      if (!result.ok) return result.error;
      return null;
    } catch {
      return SAVE_ERROR;
    }
  };

  const commitVenue = (run: () => void) => {
    if (pointDevice || !locationId) {
      run();
      return;
    }
    setConfirm({ text: VENUE_SOUND_CONFIRM, run });
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
    if (venueOwner) {
      setProfile(next);
      generation.current += 1;
      player?.cancelAtmosphereRebuild();
      clearAtmosphereRestart();
      clearTimers();
      setPhase("idle");
      setSendState("idle");
      setSaveError(null);
      try {
        window.localStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(next));
      } catch {
        /* private mode keeps the choice for this visit */
      }
      return;
    }
    commitVenue(() => {
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
    });
  };

  const createAtmosphere = () => {
    if (phase === "assembling" || !queue.effectiveDaypart) return;
    // The owner builds it here first. The venue gets it only via «Отправить в кофейню».
    if (venueOwner) {
      startAtmosphere();
      return;
    }
    commitVenue(() => startAtmosphere());
  };

  const sendToVenue = () => {
    if (!venueOwner || sendState === "sending" || confirm) return;
    const sent = profile;
    setConfirm({
      text: VENUE_SEND_CONFIRM,
      run: () => {
        setSendState("sending");
        setSaveError(null);
        void persist(sent, queue.prefs.daypartMode, queue.hours).then((error) => {
          if (!mounted.current) return;
          if (error) {
            setSaveError(error);
            setSendState("idle");
            return;
          }
          venueProfile.current = sent;
          setSendState("sent");
        });
      },
    });
  };

  const startAtmosphere = () => {
    const daypart = queue.effectiveDaypart;
    if (!daypart) return;
    try {
      window.localStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(profile));
    } catch {
      /* the in-memory profile still goes to the player */
    }
    setSendState("idle");
    setSaveError(null);
    // Point device: wait for the server. A 403 must not look like success.
    const persisted = venueOwner ? Promise.resolve(null) : persist(profile, queue.prefs.daypartMode, queue.hours);
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
    if (!pointDevice) markAtmosphereRestart(playingNow);
    const pending = pointDevice
      ? persisted.then((error) => (error ? ("failed" as const) : ("deferred" as const)))
      : player?.rebuildFromProfile({
          character: profile.character,
          direction: profile.direction,
          daypart,
          feedback: queue.feedback,
        }) ?? Promise.resolve("deferred" as const);
    timers.current.push(window.setTimeout(() => {
      void Promise.all([pending, persisted]).then(([result, error]) => {
        if (!mounted.current || generation.current !== gen) return;
        setSaveError(error);
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
          <p className="business-atmosphere-assembling__title">
            {pointDevice ? "Новое звучание начнётся со следующего трека" : "Атмосфера создана"}
          </p>
          {venueOwner ? (
            sendState === "sent" ? (
              <p className="business-app-alert" data-tone="ok" role="status" data-testid="biz-atmosphere-sent">{VENUE_SENT}</p>
            ) : (
              <button
                type="button"
                className="business-app-btn business-app-btn-primary business-app-focus-ring business-atmosphere-assemble"
                onClick={sendToVenue}
                disabled={sendState === "sending" || confirm !== null}
                data-testid="biz-atmosphere-send-venue"
              >
                {sendState === "sending" ? "Отправляем…" : "Отправить в кофейню"}
              </button>
            )
          ) : null}
          <Link
            href="/music"
            className={`business-app-btn ${venueOwner ? "business-app-btn-secondary" : "business-app-btn-primary"} business-app-focus-ring business-atmosphere-assemble`}
            data-testid="biz-atmosphere-open-player"
          >
            Перейти в плеер
          </Link>
        </div>
      ) : null}
      {saveError ? (
        <p className="business-app-alert" data-tone="warn" role="alert" data-testid="biz-sound-save-error">{saveError}</p>
      ) : null}
      {pointDevice && saveError === POINT_MUSIC_FORBIDDEN ? <PointSoundLockedHow /> : null}
    </div>
  );

  const canEditPoint = player?.pointDevice ? player.canChangeMusic : pointCanEdit && saved?.pointCanEditSettings !== false;
  if (pointDevice && !canEditPoint) {
    return (
      <section className="business-app-card" data-testid="biz-point-sound-locked">
        <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
          Музыку в зале меняет телефон владельца. На этом устройстве выбор закрыт.
        </p>
        <div className="mt-2">
          <PointSoundLockedHow />
        </div>
      </section>
    );
  }

  return (
    <>
      {confirm ? (
        <VenueConfirmDialog
          text={confirm.text}
          onYes={() => {
            const run = confirm.run;
            setConfirm(null);
            run();
          }}
          onNo={() => {
            confirm.cancel?.();
            setConfirm(null);
          }}
        />
      ) : null}
      <BusinessSoundSettings
        profile={profile}
        onChange={onChange}
        showDaypart={false}
        hint="Характер заведения и тип звучания учитываются в очереди. Время суток выбирается ниже, по часам этого устройства."
        action={action}
      />
      <section className="business-app-card space-y-3">
        <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Очередь</h2>
        <CafeQueueControls
          mode={queue.prefs.daypartMode}
          effectiveDaypart={queue.effectiveDaypart}
          onDaypart={(mode) => {
            commitVenue(() => {
              queue.setDaypartMode(mode);
              void persist(venueOwner ? venueProfile.current : profile, mode, queue.hours).then((error) => setSaveError(error));
            });
          }}
          hours={queue.hours}
        />
      </section>
      <section className="business-app-card space-y-3">
        <CafeDaypartHoursForm
          hours={queue.hours}
          onSave={async (next) => {
            const invalid = validateCafeDaypartHours(next);
            if (invalid) return invalid;
            const save = () => {
              queue.setDaypartHours(next);
              return persist(venueOwner ? venueProfile.current : profile, queue.prefs.daypartMode, next);
            };
            if (pointDevice || !locationId) return save();
            return new Promise((resolve) => {
              setConfirm({
                text: VENUE_SOUND_CONFIRM,
                run: () => { void save().then(resolve); },
                cancel: () => resolve(null),
              });
            });
          }}
        />
      </section>
    </>
  );
}
