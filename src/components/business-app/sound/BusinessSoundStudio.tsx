"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { useHasLiveBusinessAccess } from "@/components/business-app/BusinessAccessLine";
import { useBusinessGuestStatus } from "@/components/business-app/BusinessGuestStatus";
import BusinessPlayerControls from "@/components/business-app/BusinessPlayerControls";
import BusinessSoundSettings from "@/components/business-app/sound/BusinessSoundSettings";
import { BUSINESS_GIFT_CTA } from "@/lib/access-grants/copy";
import { BUSINESS_TRIAL_SIGN_UP_HREF } from "@/lib/access-grants/paths";
import { BUSINESS_CONNECT_HREF, resolveBusinessAccess } from "@/lib/business-app/access";
import {
  assembleGuestCoffeeAtmosphere,
  guestCoffeeAtmosphereKey,
  guestCoffeeAtmosphereMatchLines,
  guestCoffeeAtmosphereMeta,
  guestCoffeeTrackClock,
  type GuestCoffeeAtmosphere,
} from "@/lib/business-app/guest-coffee/atmosphere";
import {
  GUEST_COFFEE_DEFAULT_PROFILE,
  GUEST_COFFEE_DIRECTIONS,
  type GuestCoffeePlaylist,
  type GuestCoffeeProfile,
} from "@/lib/business-app/guest-coffee/catalog";
import {
  GUEST_COFFEE_ATLAS_URL,
  GUEST_COFFEE_ATMOSPHERE_COPY,
  GUEST_COFFEE_COPY,
  GUEST_COFFEE_RIGHTS_URL,
} from "@/lib/business-app/guest-coffee/copy";
import {
  GUEST_COFFEE_REPORT_INTERVAL_MS,
  GuestCoffeePlaybackMeter,
  type GuestCoffeeLimitState,
} from "@/lib/business-app/guest-coffee/limit";
import type { GuestCoffeeRecommendationPlan } from "@/lib/business-app/guest-coffee/recommend";
import {
  BUSINESS_SOUND_PROFILE_STORAGE_KEY,
  parseBusinessSoundProfile,
  serializeBusinessSoundProfile,
} from "@/lib/business-app/sound-profile";
import type { SpaManifestItem } from "@/lib/business-app/spa-manifest";
import { SpaOnlinePlayer as Controller, type OnlineStatus } from "@/lib/business-app/spa-online-player";

/**
 * a8240527 – Music section of the AudioLad Business cabinet: sound settings, the
 * «Собрать атмосферу» step and the Business player. Rendered inside the shared
 * BusinessAppShell for the guest (https://business.audiolad.ru/guest/coffee) and for the
 * owner (/music) alike.
 *
 * Sergey 17.10.2026 23:21: settings no longer change the music silently. The visitor picks
 * the settings and presses «Собрать атмосферу»; after a short assembling moment the cabinet
 * shows ONE ready playlist («Ваша атмосфера») assembled from real tracks of the curated
 * free albums (src/lib/business-app/guest-coffee/atmosphere.ts). Changing the settings
 * afterwards only offers «Пересобрать атмосферу» – the assembled playlist stays as it is.
 *
 * The albums are free public catalogue albums for PRIVATE evaluation listening, metered on
 * the server (30 minutes, /api/business/guest/coffee/*). They are not the venue airplay
 * catalogue: airplay is the point's program player with rights-confirmed tracks only.
 */
type Props = {
  playlists: GuestCoffeePlaylist[];
  /** Server ranking for all 64 settings (ids, track positions, yes / no matches only). */
  plan?: GuestCoffeeRecommendationPlan | null;
  initialLimit: GuestCoffeeLimitState;
};

type View = { status: OnlineStatus; current: SpaManifestItem | null; message: string | null; index: number };

const JSON_POST = { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store" } as const;

/** Visible assembling moment: one step per line, short but noticeable. */
const ATMOSPHERE_STEP_MS = 520;
const ATMOSPHERE_REDUCED_MOTION_MS = 450;

function toItems(atmosphere: GuestCoffeeAtmosphere): SpaManifestItem[] {
  return atmosphere.tracks.map((t, position) => ({
    position,
    audioItemId: t.audioItemId,
    trackCode: null,
    title: t.title,
    durationSeconds: t.durationSeconds,
    gainDb: null,
    playableUntil: null,
    offlineAllowed: false,
    offlineCacheUntil: null,
  }));
}

function isLimit(value: unknown): value is GuestCoffeeLimitState {
  return value === "ok" || value === "near_end" || value === "exhausted" || value === "unavailable";
}

function readStoredProfile(): GuestCoffeeProfile {
  try {
    return parseBusinessSoundProfile(window.localStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY));
  } catch {
    return GUEST_COFFEE_DEFAULT_PROFILE;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function assemblingSteps(profile: GuestCoffeeProfile): string[] {
  const direction = GUEST_COFFEE_DIRECTIONS.find((d) => d.id === profile.direction)?.label ?? "";
  return [
    `Подбираем треки по звучанию «${direction}»…`,
    "Сверяем время суток и характер заведения…",
    "Сводим треки в одну подборку…",
  ];
}

export default function BusinessSoundStudio({ playlists, plan = null, initialLimit }: Props) {
  const access = resolveBusinessAccess(useBusinessDomain());
  const guest = access.level === "guest";
  // 30-day gift / paid period already live: never offer the gift again (Sergey 23.10.2026).
  const liveAccess = useHasLiveBusinessAccess();
  const offerGift = guest && !liveAccess;
  const { setLimit: reportLimitToShell } = useBusinessGuestStatus();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctlRef = useRef<Controller | null>(null);
  const meterRef = useRef(new GuestCoffeePlaybackMeter());
  const resultRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);
  // SSR renders the default profile; the device's saved settings are applied after mount.
  const [profile, setProfile] = useState<GuestCoffeeProfile>(GUEST_COFFEE_DEFAULT_PROFILE);
  const [atmosphere, setAtmosphere] = useState<GuestCoffeeAtmosphere | null>(null);
  /** Assembling in progress: the step shown (0-based) and the steps' texts. */
  const [assembling, setAssembling] = useState<{ step: number; steps: string[] } | null>(null);
  const [view, setView] = useState<View>({ status: "idle", current: null, message: null, index: -1 });
  const [limit, setLimit] = useState<GuestCoffeeLimitState>(initialLimit);

  useEffect(() => {
    const stored = readStoredProfile();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from device storage
    setProfile((prev) => (serializeBusinessSoundProfile(prev) === serializeBusinessSoundProfile(stored) ? prev : stored));
  }, []);

  useEffect(() => reportLimitToShell(limit), [limit, reportLimitToShell]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const applyLimit = useCallback((value: unknown) => {
    if (!isLimit(value)) return;
    // The server total only grows within a visit: never step back from "exhausted".
    setLimit((prev) => (prev === "exhausted" && value !== "unavailable" ? prev : value));
  }, []);

  /** Report seconds of actual playback to the server meter. */
  const flush = useCallback(
    async (keepalive = false) => {
      const meter = meterRef.current;
      const seconds = meter.take();
      if (seconds <= 0) return;
      try {
        const res = await fetch("/api/business/guest/coffee/usage", {
          ...JSON_POST,
          keepalive,
          body: JSON.stringify({ seconds }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; limit?: unknown } | null;
        if (!json || json.ok !== true) {
          if (json && isLimit(json.limit)) applyLimit(json.limit);
          else meter.restore(seconds);
          return;
        }
        applyLimit(json.limit);
      } catch {
        meter.restore(seconds);
      }
    },
    [applyLimit],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const meter = meterRef.current;
    const ctl = new Controller(
      {
        audio,
        now: () => Date.now(),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (t) => window.clearTimeout(t as number),
        sign: async (audioItemId) => {
          try {
            const res = await fetch("/api/business/guest/coffee/track-url", {
              ...JSON_POST,
              body: JSON.stringify({ audioItemId }),
            });
            const json = (await res.json()) as
              | { ok: true; data: { url: string }; limit?: unknown }
              | { ok: false; reason: string; limit?: unknown };
            if (json && "limit" in json) applyLimit(json.limit);
            if (json && json.ok === true && typeof json.data?.url === "string") return { ok: true, data: { url: json.data.url } };
            return { ok: false, reason: json && json.ok === false ? json.reason : "network" };
          } catch {
            return { ok: false, reason: "network" };
          }
        },
        onChange: () => {
          const c = ctlRef.current;
          if (c) setView({ status: c.status, current: c.current, message: c.message, index: c.index });
        },
      },
      [],
    );
    ctlRef.current = ctl;
    const onTime = () => meter.sample(audio.currentTime, !audio.paused && !audio.ended);
    const onBreak = () => meter.reanchor();
    const onEnded = () => {
      meter.reanchor();
      void ctl.onEnded();
    };
    const onError = () => {
      meter.reanchor();
      void ctl.onError();
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("pause", onBreak);
    audio.addEventListener("seeking", onBreak);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    const timer = window.setInterval(() => void flush(), GUEST_COFFEE_REPORT_INTERVAL_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    const onPageHide = () => void flush(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("pause", onBreak);
      audio.removeEventListener("seeking", onBreak);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      void flush(true);
      ctl.dispose();
      ctlRef.current = null;
    };
  }, [applyLimit, flush]);

  // Report promptly when playback pauses so the server total stays accurate.
  useEffect(() => {
    if (view.status === "paused" || view.status === "idle" || view.status === "no_access") void flush();
  }, [view.status, flush]);

  const exhausted = limit === "exhausted";
  const unavailable = limit === "unavailable";
  const status = view.status;
  const isPlaying = status === "playing" || status === "loading";
  const canStart = !unavailable && !(exhausted && !isPlaying) && status !== "no_access";

  const currentKey = guestCoffeeAtmosphereKey(profile);
  const dirty = atmosphere !== null && atmosphere.key !== currentKey;
  const isAssembling = assembling !== null;
  const canAssemble = playlists.length > 0 && !isAssembling && (atmosphere === null || dirty);

  const revealResult = (reduced: boolean) => {
    const el = resultRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.55) el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  };

  const assemble = () => {
    if (!canAssemble) return;
    // Computed right away (pure); revealed after the short assembling moment.
    const next = assembleGuestCoffeeAtmosphere(playlists, profile, plan);
    const steps = assemblingSteps(profile);
    const reduced = prefersReducedMotion();
    setAssembling({ step: 0, steps });
    // Mobile: the result sits below the settings – bring the assembling moment into view.
    window.requestAnimationFrame(() => revealResult(reduced));
    const stepMs = reduced ? ATMOSPHERE_REDUCED_MOTION_MS : ATMOSPHERE_STEP_MS;
    const total = reduced ? ATMOSPHERE_REDUCED_MOTION_MS : ATMOSPHERE_STEP_MS * steps.length;
    if (!reduced) {
      for (let i = 1; i < steps.length; i++) {
        timersRef.current.push(window.setTimeout(() => setAssembling((a) => (a ? { ...a, step: i } : a)), stepMs * i));
      }
    }
    timersRef.current.push(
      window.setTimeout(() => {
        setAssembling(null);
        setAtmosphere(next);
        // The player always holds the shown atmosphere. If music is playing it goes on
        // (with the same track if it is in the new playlist, else from the new first track).
        const ctl = ctlRef.current;
        if (ctl && next) void ctl.applyManifest(toItems(next));
        window.requestAnimationFrame(() => revealResult(reduced));
      }, total),
    );
  };

  const playAtmosphere = async (fromIndex?: number) => {
    const ctl = ctlRef.current;
    if (!ctl || !atmosphere) return;
    const loaded = ctl.items.length === atmosphere.tracks.length && ctl.items.every((it, i) => it.audioItemId === atmosphere.tracks[i].audioItemId);
    if (!loaded) await ctl.applyManifest(toItems(atmosphere));
    if (fromIndex === undefined) {
      if (ctl.current && (isPlaying || ctl.status === "paused")) {
        await ctl.toggle();
        return;
      }
      if (!canStart) return;
      await ctl.playIndex(0);
      return;
    }
    if (fromIndex === ctl.index && (isPlaying || (ctl.status === "paused" && canStart))) {
      // The current track: pause it, or resume it where it stopped.
      await ctl.toggle();
      return;
    }
    if (!canStart) return;
    await ctl.playIndex(fromIndex);
  };

  const setAxis = <K extends keyof GuestCoffeeProfile>(key: K, value: GuestCoffeeProfile[K]) =>
    setProfile((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY, serializeBusinessSoundProfile(next));
      } catch {
        // storage blocked (private mode): settings still work for this visit
      }
      return next;
    });

  const showExhaustedPanel = exhausted && !isPlaying;
  const notice = unavailable
    ? GUEST_COFFEE_COPY.unavailable
    : exhausted && isPlaying
      ? GUEST_COFFEE_COPY.lastTrack
      : limit === "near_end"
        ? GUEST_COFFEE_COPY.nearEnd
        : null;
  const playerMessage = unavailable || status === "no_access" ? null : view.message;
  const C = GUEST_COFFEE_ATMOSPHERE_COPY;
  const assembleLabel = isAssembling ? C.assembling : atmosphere === null ? C.assemble : dirty ? C.reassemble : C.assembled;
  const playingAtmosphere = atmosphere !== null && isPlaying;

  const assembleButton = (
    <div className="business-atmosphere-action">
      <button
        type="button"
        className="business-app-btn business-app-btn-primary business-app-focus-ring business-atmosphere-assemble"
        onClick={assemble}
        disabled={!canAssemble}
        aria-busy={isAssembling}
        data-state={isAssembling ? "assembling" : atmosphere === null ? "initial" : dirty ? "dirty" : "assembled"}
        data-testid="biz-atmosphere-assemble"
      >
        {assembleLabel}
      </button>
      {dirty && !isAssembling ? (
        <p className="business-app-alert" data-tone="warn" role="status" data-testid="biz-atmosphere-dirty">
          {C.dirty}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="business-sound" data-testid="biz-sound" data-limit={limit} data-access={access.level}>
      <div className="business-sound-layout">
        <BusinessSoundSettings profile={profile} onChange={setAxis} note={GUEST_COFFEE_COPY.settingsSaved} action={assembleButton} />

        <section
          className="business-sound-results"
          aria-labelledby="business-sound-results-title"
          data-testid="biz-sound-results"
        >
          <h2 id="business-sound-results-title" className="text-[1.15rem] font-bold text-[var(--biz-text)]">
            {C.resultsTitle}
          </h2>
          {showExhaustedPanel ? (
            <div className="business-app-card business-sound-limit" role="status" data-testid="biz-sound-exhausted">
              <h3 className="text-[1.05rem] font-bold text-[var(--biz-text)]">
                {liveAccess ? GUEST_COFFEE_COPY.exhaustedTrialTitle : GUEST_COFFEE_COPY.exhaustedTitle}
              </h3>
              <p className="mt-1 text-[var(--biz-text-muted)]">
                {offerGift
                  ? GUEST_COFFEE_COPY.exhaustedText
                  : guest
                    ? GUEST_COFFEE_COPY.exhaustedTrialText
                    : GUEST_COFFEE_COPY.exhaustedMember}
              </p>
              {guest && liveAccess ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={BUSINESS_CONNECT_HREF} className="business-app-btn business-app-btn-primary business-app-focus-ring" data-testid="biz-connect-cta">
                    Подключить точку
                  </Link>
                </div>
              ) : null}
              {offerGift ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={BUSINESS_TRIAL_SIGN_UP_HREF} className="business-app-btn business-app-btn-primary business-app-focus-ring" data-testid="biz-trial-cta">
                    {BUSINESS_GIFT_CTA}
                  </a>
                  <Link href={BUSINESS_CONNECT_HREF} className="business-app-btn business-app-btn-secondary business-app-focus-ring">
                    Подключить
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
          {notice && !showExhaustedPanel ? (
            <p className="business-app-alert" data-tone="warn" role="status" data-testid="biz-sound-notice">
              {notice}
            </p>
          ) : null}

          <div ref={resultRef} className="business-atmosphere-anchor" aria-live="polite">
            {playlists.length === 0 ? (
              <p className="business-app-card text-[var(--biz-text-muted)]" data-testid="biz-sound-empty">
                {GUEST_COFFEE_COPY.emptyShelf}
              </p>
            ) : assembling ? (
              <div className="business-app-card business-atmosphere-assembling" role="status" data-testid="biz-atmosphere-assembling">
                <span className="business-atmosphere-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <p className="business-atmosphere-assembling__title">{C.assemblingTitle}</p>
                <ol className="business-atmosphere-steps">
                  {assembling.steps.map((text, i) => (
                    <li key={text} data-state={i < assembling.step ? "done" : i === assembling.step ? "active" : "next"}>
                      {text}
                    </li>
                  ))}
                </ol>
              </div>
            ) : atmosphere === null ? (
              <div className="business-app-card business-atmosphere-empty" data-testid="biz-atmosphere-empty">
                <p className="business-atmosphere-empty__title">{C.emptyTitle}</p>
                <p className="mt-1 text-[var(--biz-text-muted)]">{C.emptyText}</p>
              </div>
            ) : (
              <article
                className="business-app-card business-atmosphere"
                data-testid="biz-atmosphere"
                data-key={atmosphere.key}
                data-stale={dirty ? "true" : undefined}
                aria-labelledby="business-atmosphere-name"
              >
                {dirty ? (
                  <div className="business-atmosphere__stale" role="status" data-testid="biz-atmosphere-stale">
                    <p>{C.stale}</p>
                    <button
                      type="button"
                      className="business-app-btn business-app-btn-secondary business-app-focus-ring"
                      onClick={assemble}
                      disabled={!canAssemble}
                      data-testid="biz-atmosphere-reassemble"
                    >
                      {C.reassemble}
                    </button>
                  </div>
                ) : null}
                <h3 id="business-atmosphere-name" className="business-atmosphere__name" data-testid="biz-atmosphere-name">
                  {atmosphere.name}
                </h3>
                <p className="business-app-muted text-sm" data-testid="biz-atmosphere-meta">{guestCoffeeAtmosphereMeta(atmosphere)}</p>
                <div className="business-atmosphere__actions">
                  <button
                    type="button"
                    className="business-app-btn business-app-btn-primary business-app-focus-ring"
                    onClick={() => void playAtmosphere()}
                    disabled={!playingAtmosphere && !canStart}
                    aria-pressed={playingAtmosphere}
                    data-testid="biz-atmosphere-play"
                  >
                    {playingAtmosphere ? (status === "loading" ? "…" : "Пауза") : C.play}
                  </button>
                </div>
                <ul className="business-atmosphere-match" aria-label={C.matchTitle} data-testid="biz-atmosphere-match">
                  {guestCoffeeAtmosphereMatchLines(atmosphere).map((line) => (
                    <li key={line.id} data-state={line.state}>
                      <span aria-hidden="true">{line.state === "all" ? "✓" : "≈"}</span> {line.text}
                    </li>
                  ))}
                </ul>
                <p className="business-app-muted text-sm">{C.matchNote}</p>
                <ol className="business-atmosphere-tracks" data-testid="biz-atmosphere-tracks">
                  {atmosphere.tracks.map((track, i) => {
                    const current = view.index === i && view.current?.audioItemId === track.audioItemId;
                    const clock = guestCoffeeTrackClock(track.durationSeconds);
                    return (
                      <li key={track.audioItemId}>
                        <button
                          type="button"
                          className="business-atmosphere-track business-app-focus-ring"
                          data-current={current ? "true" : undefined}
                          aria-current={current ? "true" : undefined}
                          onClick={() => void playAtmosphere(i)}
                          disabled={!(current && isPlaying) && !canStart}
                          data-testid="biz-atmosphere-track"
                        >
                          <span className="business-atmosphere-track__no" aria-hidden="true">
                            {current && isPlaying ? "♪" : i + 1}
                          </span>
                          <span className="business-atmosphere-track__meta">
                            <span className="business-atmosphere-track__title">{track.title}</span>
                            <span className="business-atmosphere-track__album">
                              {track.albumTitle}
                              {track.authorName ? ` · ${track.authorName}` : ""}
                            </span>
                          </span>
                          {clock ? <span className="business-atmosphere-track__time">{clock}</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <p className="business-app-muted text-sm" data-testid="biz-atmosphere-sources">
                  {C.sourcesTitle}: {atmosphere.sources.map((s) => `«${s.title}»${s.authorName ? ` (${s.authorName})` : ""}`).join(", ")}.
                </p>
              </article>
            )}
          </div>
          <p className="business-app-muted text-sm">{GUEST_COFFEE_COPY.shelfSource}</p>
          <p className="business-app-muted text-sm">
            {GUEST_COFFEE_COPY.evaluationOnly} <a className="underline" href={GUEST_COFFEE_RIGHTS_URL}>Как устроены права на музыку</a>
          </p>
          {guest ? (
            <p className="text-sm">
              <a className="underline" href={GUEST_COFFEE_ATLAS_URL} data-testid="biz-back-to-atlas">
                Вернуться в атлас кофеен</a>
            </p>
          ) : null}
        </section>
      </div>

      <section className="business-app-card business-sound-player" aria-label="Плеер АудиоЛад Бизнес" data-testid="biz-player" data-status={status} aria-live="polite">
        {atmosphere && view.current ? (
          <>
            <p className="business-sound-player__list business-app-muted text-sm">{C.eyebrow}: {atmosphere.name}</p>
            <BusinessPlayerControls
              testIdPrefix="biz-player"
              playing={status === "playing"}
              loading={status === "loading"}
              nowTitle={view.current.title}
              onToggle={() => void ctlRef.current?.toggle()}
              onNext={() => void ctlRef.current?.next()}
              startDisabled={!canStart}
              nextDisabled={!canStart}
            />
          </>
        ) : (
          <p className="business-app-muted">{atmosphere ? C.playerReady : C.playerIdle}</p>
        )}
        {playerMessage ? (
          <p className="business-app-alert mt-2" data-tone="warn" role="alert">
            {playerMessage}
          </p>
        ) : null}
      </section>

      <audio ref={audioRef} preload="none" playsInline />
    </div>
  );
}
