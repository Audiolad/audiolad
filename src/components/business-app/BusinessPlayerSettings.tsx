"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { coffeeStorage } from "@/lib/business-app/shared-coffee-storage";

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
import { announceAtmosphereSaved, clearAtmosphereRestart, markAtmosphereRestart } from "@/lib/business-app/cafe-queue/atmosphere-restart";
import {
  ATMOSPHERE_REBUILD_DONE,
  ATMOSPHERE_REBUILD_DONE_NOTE,
  ATMOSPHERE_REBUILD_LABEL,
  atmosphereRebuildConfirmText,
} from "@/lib/business-app/atmosphere-rebuild";
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
import { continueOwnerRebuild } from "@/lib/business-app/atmosphere-rebuild-flow";
import { latestVenueProfile, recordVenueSound, serialVenueWrite } from "@/lib/business-app/venue-sound-writes";
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
const REBUILD_ERROR = "Не удалось пересобрать атмосферу. Попробуйте ещё раз.";
const REBUILD_PLAYER_ERROR = "Атмосфера сохранена для заведения, но плеер на этом телефоне не пересобрался. Нажмите «Пересобрать атмосферу» ещё раз.";

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
  venueSide = false,
}: {
  locationId?: string | null;
  saved?: LocationSoundSettings | null;
  /** This browser is the paired device. It cannot write when the owner turned that off. */
  pointDevice?: boolean;
  /** Server flag. Missing row stays allowed. */
  pointCanEdit?: boolean;
  /** Hall device or the owner's preview of it: day-time choices stay with the owner (cabinet-mode.ts «daypartSettings»). */
  venueSide?: boolean;
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
  /**
   * Owner with a venue («Управление кофейней»): «Пересобрать атмосферу». Chips stay on this phone
   * until the owner confirms; then the venue row is saved (owner-only server action) and the
   * queue is rebuilt by the same algorithm as «Создать атмосферу».
   */
  const venueOwner = Boolean(locationId) && !pointDevice;
  /** Only the owner panel rebuilds; the preview («как видит точка») builds on this phone only. */
  const ownerRebuild = venueOwner && !venueSide;
  /** What the venue already has. Daypart and hours saves keep it, so unconfirmed chips do not leak. */
  const venueProfile = useRef<GuestCoffeeProfile>(seeded?.profile ?? GUEST_COFFEE_DEFAULT_PROFILE);
  /** The venue has a saved atmosphere (the confirm names it). */
  const venueKnown = useRef(seeded !== null);
  const [step, setStep] = useState(0);
  const [steps, setSteps] = useState<string[]>([]);
  const timers = useRef<number[]>([]);
  const generation = useRef(0);
  const mounted = useRef(true);
  /** Generation of the settings-owned queue rebuild waiting for the server, if any. */
  const rebuildInFlight = useRef<number | null>(null);
  const cancelRebuild = useRef<() => void>(() => {});
  useEffect(() => {
    cancelRebuild.current = () => player?.cancelAtmosphereRebuild();
  });
  /**
   * Venue writes go one after another for the whole tab (venue-sound-writes.ts), so an older
   * save never lands after a newer one, even from a builder that was collapsed and reopened.
   */
  const serialWrite = <T,>(run: () => Promise<T>): Promise<T> => (locationId ? serialVenueWrite(locationId, run) : run());
  /**
   * The atmosphere the venue row holds: the current `saved` row (profile and version together)
   * or a newer save from this tab.
   */
  const currentVenue = (): { profile: GuestCoffeeProfile; known: boolean } => {
    const rowProfile = saved ? locationSoundProfile(saved) : venueProfile.current;
    if (!locationId) return { profile: rowProfile, known: venueKnown.current };
    const latest = latestVenueProfile(locationId, rowProfile, saved?.settingsVersion ?? 0);
    return { profile: latest.profile, known: latest.known || venueKnown.current };
  };

  useEffect(() => {
    if (saved) {
      const next = locationSoundProfile(saved);
      // A revalidated venue row is what daypart and hours saves keep from now on.
      venueProfile.current = next;
      venueKnown.current = true;
      try {
        coffeeStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(next));
      } catch {
        /* private mode keeps the server profile for this visit */
      }
      return;
    }
    let next = GUEST_COFFEE_DEFAULT_PROFILE;
    try {
      next = parseBusinessSoundProfile(coffeeStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY));
    } catch {
      next = GUEST_COFFEE_DEFAULT_PROFILE;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the device sound profile after hydration
    setProfile(next);
  }, [saved]);

  /** `nextProfile` as a function is read when the write runs (after earlier writes in the chain). */
  const persist = (
    nextProfile: GuestCoffeeProfile | (() => GuestCoffeeProfile),
    daypartMode: CafeDaypartMode,
    hours: CafeDaypartHours,
  ): Promise<string | null> => serialWrite(() => persistNow(typeof nextProfile === "function" ? nextProfile() : nextProfile, daypartMode, hours));

  const persistNow = async (nextProfile: GuestCoffeeProfile, daypartMode: CafeDaypartMode, hours: CafeDaypartHours) => {
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
      if (venueOwner) recordVenueSound(locationId, nextProfile, result.settingsVersion);
      return null;
    } catch {
      return SAVE_ERROR;
    }
  };

  /** «Пересобрать атмосферу»: the same RPC, behind the owner-only row «atmosphereRebuild». */
  const persistRebuild = (nextProfile: GuestCoffeeProfile): Promise<string | null> => serialWrite(async () => {
    if (!locationId) return REBUILD_ERROR;
    const draft = locationSoundDraftFromParts(nextProfile, queue.prefs, queue.hours);
    try {
      const { rebuildLocationAtmosphere } = await import("@/app/business-app/sound-settings-actions");
      const result = await rebuildLocationAtmosphere(locationId, draft);
      if (!result.ok) return result.error;
      // Saved: daypart and hours writes from now on keep this atmosphere.
      venueProfile.current = nextProfile;
      venueKnown.current = true;
      recordVenueSound(locationId, nextProfile, result.settingsVersion);
      return null;
    } catch {
      return REBUILD_ERROR;
    }
  });

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
      // Leaving the page: the open music page owns the queue request from now on.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the in-flight token at unmount time is wanted, not the one at mount
      if (rebuildInFlight.current !== null) cancelRebuild.current();
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
      setSaveError(null);
      // Owner rebuild: chips stay in memory until the confirmed save; the player must not pick them up earlier.
      if (ownerRebuild) return;
      try {
        coffeeStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(next));
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
        coffeeStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(next));
      } catch {
        /* private mode keeps the choice for this visit */
      }
      void persist(next, queue.prefs.daypartMode, queue.hours).then((error) => setSaveError(error));
    });
  };

  const createAtmosphere = () => {
    if (phase === "assembling" || !queue.effectiveDaypart) return;
    // Owner: say what changes before anything reaches the hall.
    if (ownerRebuild) {
      if (confirm) return;
      const next = profile;
      const venue = currentVenue();
      setConfirm({
        text: atmosphereRebuildConfirmText(next, venue.known ? venue.profile : null),
        run: () => startAtmosphere(next),
      });
      return;
    }
    commitVenue(() => startAtmosphere());
  };

  /** `built`: the profile the owner confirmed (the chips may move while the confirm is open). */
  const startAtmosphere = (built: GuestCoffeeProfile = profile) => {
    const daypart = queue.effectiveDaypart;
    if (!daypart) return;
    const storeBuilt = () => {
      try {
        coffeeStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(built));
      } catch {
        /* the in-memory profile still goes to the player */
      }
    };
    // Owner rebuild stores the profile only after the venue row is saved.
    if (!ownerRebuild) storeBuilt();
    setSaveError(null);
    // Point device and owner rebuild: wait for the server. A 403 must not look like success.
    const persisted = ownerRebuild
      ? persistRebuild(built)
      : venueOwner
        ? Promise.resolve(null)
        : persist(built, queue.prefs.daypartMode, queue.hours);
    const directionLabel = GUEST_COFFEE_DIRECTIONS.find((item) => item.id === built.direction)?.label ?? "";
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
    if (!pointDevice && !ownerRebuild) markAtmosphereRestart(playingNow);
    const rebuildInput = {
      character: built.character,
      direction: built.direction,
      daypart,
      feedback: queue.feedback,
    };
    const pending = pointDevice
      ? persisted.then((error) => (error ? ("failed" as const) : ("deferred" as const)))
      : ownerRebuild
        // The venue row first; only a saved rebuild changes the owner's own upcoming queue, preserving the current track.
        ? persisted.then((error) => continueOwnerRebuild(error, {
            gen,
            currentGeneration: () => generation.current,
            isMounted: () => mounted.current,
            inFlight: rebuildInFlight,
            storeProfile: storeBuilt,
            markRestart: () => markAtmosphereRestart(playingNow),
            clearRestart: clearAtmosphereRestart,
            announceSaved: announceAtmosphereSaved,
            rebuild: () => player?.rebuildFromProfile(rebuildInput) ?? Promise.resolve("deferred" as const),
          }))
      : player?.rebuildFromProfile(rebuildInput) ?? Promise.resolve("deferred" as const);
    timers.current.push(window.setTimeout(() => {
      void Promise.all([pending, persisted]).then(([result, error]) => {
        if (!mounted.current || generation.current !== gen) return;
        setSaveError(error);
        if (result === "failed") {
          if (!ownerRebuild) clearAtmosphereRestart();
          setPhase("idle");
          return;
        }
        if (result === "player-failed") {
          setSaveError(REBUILD_PLAYER_ERROR);
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
          className={`business-app-btn ${ownerRebuild ? "business-app-btn-cta" : "business-app-btn-primary"} business-app-focus-ring business-atmosphere-assemble`}
          onClick={createAtmosphere}
          disabled={confirm !== null}
          data-testid={ownerRebuild ? "biz-atmosphere-rebuild-apply" : "biz-create-atmosphere"}
        >
          {ownerRebuild ? ATMOSPHERE_REBUILD_LABEL : "Создать атмосферу"}
        </button>
      ) : null}
      {phase === "assembling" ? <AtmosphereAssembling step={step} steps={steps} /> : null}
      {phase === "done" ? (
        <div className="business-app-card business-atmosphere-assembling" role="status" data-testid="biz-atmosphere-created">
          <p className="business-atmosphere-assembling__title">
            {pointDevice ? "Новое звучание начнётся со следующего трека" : ownerRebuild ? ATMOSPHERE_REBUILD_DONE : "Атмосфера создана"}
          </p>
          {ownerRebuild ? (
            <p className="business-app-alert" data-tone="ok" data-testid="biz-atmosphere-rebuilt">{ATMOSPHERE_REBUILD_DONE_NOTE}</p>
          ) : null}
          <Link
            href="/music"
            className="business-app-btn business-app-btn-primary business-app-focus-ring business-atmosphere-assemble"
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
        title={ownerRebuild ? "Новая атмосфера" : undefined}
        hint={
          venueSide
            ? "Характер заведения и тип звучания учитываются в очереди. Время суток настраивает владелец."
            : "Характер заведения и тип звучания учитываются в очереди. Время суток выбирается ниже, по часам этого устройства."
        }
        action={action}
      />
      {venueSide ? null : (
      <>
      <section className="business-app-card space-y-3">
        <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Очередь</h2>
        <CafeQueueControls
          mode={queue.prefs.daypartMode}
          effectiveDaypart={queue.effectiveDaypart}
          onDaypart={(mode) => {
            commitVenue(() => {
              queue.setDaypartMode(mode);
              void persist(venueOwner ? () => currentVenue().profile : profile, mode, queue.hours).then((error) => setSaveError(error));
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
              return persist(venueOwner ? () => currentVenue().profile : profile, queue.prefs.daypartMode, next);
            };
            if (pointDevice || !locationId) return save();
            return new Promise<string | null | false>((resolve) => {
              setConfirm({
                text: VENUE_SOUND_CONFIRM,
                run: () => { void save().then(resolve); },
                cancel: () => resolve(false),
              });
            });
          }}
        />
      </section>
      </>
      )}
    </>
  );
}
