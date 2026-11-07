"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";

import { useBusinessGuestStatus } from "@/components/business-app/BusinessGuestStatus";
import BusinessCabinetMiniBar from "@/components/business-app/workspace/BusinessCabinetMiniBar";
import type { GuestCoffeeAtmosphere } from "@/lib/business-app/guest-coffee/atmosphere";
import {
  GUEST_COFFEE_REPORT_INTERVAL_MS,
  GuestCoffeePlaybackMeter,
  type GuestCoffeeLimitState,
} from "@/lib/business-app/guest-coffee/limit";
import { formatPlaybackClock } from "@/lib/business-app/playback-clock";
import { FadingAudio } from "@/lib/business-app/player-fade";
import type { SpaManifestItem } from "@/lib/business-app/spa-manifest";
import { SpaOnlinePlayer as Controller, type OnlineStatus } from "@/lib/business-app/spa-online-player";

/**
 * Guest coffee playback, owned by the cabinet shell (Sergey 07.11.2026): the <audio>, its
 * controller and fade live here, not in BusinessSoundStudio. Leaving the music page – the
 * client-side move to the home after «Начать бесплатно» included – keeps the SAME element
 * playing (no new play() after an async request, so autoplay rules never apply), and the
 * mini player stays at the bottom so the music can be paused or closed from any screen.
 */
export type GuestPlaybackView = { status: OnlineStatus; current: SpaManifestItem | null; message: string | null; index: number };
export type GuestBarMeta = { title: string; coverSrc: string | null; duration: number };
/** Bar facts for every track of the assembled atmosphere, so «next» on the home shows the right title. */
export type GuestBarTracks = ReadonlyMap<string, GuestBarMeta>;

type GuestPlayback = {
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  ctlRef: MutableRefObject<Controller | null>;
  fadeRef: MutableRefObject<FadingAudio | null>;
  view: GuestPlaybackView;
  clock: { current: number; duration: number };
  volume: number;
  setVolume: (value: number) => void;
  seek: (ratio: number) => void;
  barDismissed: boolean;
  setBarDismissed: (value: boolean) => void;
  dismiss: () => Promise<void>;
  limit: GuestCoffeeLimitState;
  /** The music page's server limit; only the first page seeds it, later visits keep the live value. */
  seedLimit: (value: GuestCoffeeLimitState) => void;
  flush: (keepalive?: boolean) => Promise<void>;
  atmosphere: GuestCoffeeAtmosphere | null;
  setAtmosphere: (value: GuestCoffeeAtmosphere | null) => void;
  /** The music page draws its own bar while mounted; the shell draws it everywhere else. */
  attachStudio: () => () => void;
  setBarMeta: (tracks: GuestBarTracks | null) => void;
};

const JSON_POST = { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store" } as const;

function isLimit(value: unknown): value is GuestCoffeeLimitState {
  return value === "ok" || value === "near_end" || value === "exhausted" || value === "unavailable";
}

const GuestPlaybackContext = createContext<GuestPlayback | null>(null);

export function useBusinessGuestPlayback(): GuestPlayback {
  const value = useContext(GuestPlaybackContext);
  if (!value) throw new Error("BusinessGuestPlaybackProvider missing");
  return value;
}

/** Shell bar: shown when music was started on the music page and that page is not open now. */
export function showGuestShellBar(input: { studioMounted: boolean; meta: GuestBarMeta | null; current: unknown; dismissed: boolean; status: OnlineStatus }): boolean {
  return !input.studioMounted && input.meta !== null && Boolean(input.current) && !input.dismissed && input.status !== "idle";
}

export function BusinessGuestPlaybackProvider({ children, initialLimit = "ok" }: { children: ReactNode; initialLimit?: GuestCoffeeLimitState }) {
  const { setLimit: reportLimitToShell } = useBusinessGuestStatus();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctlRef = useRef<Controller | null>(null);
  const fadeRef = useRef<FadingAudio | null>(null);
  const meterRef = useRef(new GuestCoffeePlaybackMeter());
  const seeded = useRef(false);
  const [view, setView] = useState<GuestPlaybackView>({ status: "idle", current: null, message: null, index: -1 });
  const [clock, setClock] = useState({ current: 0, duration: 0 });
  const [volume, setVolumeState] = useState(1);
  const [barDismissed, setBarDismissed] = useState(false);
  const [limit, setLimit] = useState<GuestCoffeeLimitState>(initialLimit);
  const [atmosphere, setAtmosphere] = useState<GuestCoffeeAtmosphere | null>(null);
  const [studios, setStudios] = useState(0);
  const [barTracks, setBarMeta] = useState<GuestBarTracks | null>(null);

  useEffect(() => { if (seeded.current) reportLimitToShell(limit); }, [limit, reportLimitToShell]);

  const seedLimit = useCallback((value: GuestCoffeeLimitState) => {
    if (seeded.current) return;
    seeded.current = true;
    setLimit(value);
  }, []);

  const applyLimit = useCallback((value: unknown) => {
    if (!isLimit(value)) return;
    seeded.current = true;
    // The server total only grows within a visit: never step back from "exhausted".
    setLimit((prev) => (prev === "exhausted" && value !== "unavailable" ? prev : value));
  }, []);

  /** Report seconds of actual playback to the server meter. */
  const flush = useCallback(async (keepalive = false) => {
    const meter = meterRef.current;
    const seconds = meter.take();
    if (seconds <= 0) return;
    try {
      const res = await fetch("/api/business/guest/coffee/usage", { ...JSON_POST, keepalive, body: JSON.stringify({ seconds }) });
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
  }, [applyLimit]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const meter = meterRef.current;
    const fader = new FadingAudio(audio);
    fadeRef.current = fader;
    const ctl = new Controller(
      {
        audio: fader,
        now: () => Date.now(),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (t) => window.clearTimeout(t as number),
        sign: async (audioItemId) => {
          try {
            const res = await fetch("/api/business/guest/coffee/track-url", { ...JSON_POST, body: JSON.stringify({ audioItemId }) });
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
    const onTime = () => {
      meter.sample(audio.currentTime, !audio.paused && !audio.ended);
      if (ctl.fadingOutPrevious) return;
      setClock({ current: audio.currentTime, duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0 });
    };
    const onBreak = () => meter.reanchor();
    const onEnded = () => { meter.reanchor(); void ctl.onEnded(); };
    const onError = () => { meter.reanchor(); void ctl.onError(); };
    // One audible source: when another player on the page starts (the venue program player),
    // the guest music pauses instead of playing over it.
    const onOtherPlay = (event: Event) => {
      if (event.target !== audio && (ctl.status === "playing" || ctl.status === "loading")) void ctl.toggle();
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("pause", onBreak);
    audio.addEventListener("seeking", onBreak);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    document.addEventListener("play", onOtherPlay, true);
    const timer = window.setInterval(() => void flush(), GUEST_COFFEE_REPORT_INTERVAL_MS);
    const onHide = () => { if (document.visibilityState === "hidden") void flush(true); };
    const onPageHide = () => void flush(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("play", onOtherPlay, true);
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
      fader.dispose();
      if (fadeRef.current === fader) fadeRef.current = null;
    };
  }, [applyLimit, flush]);

  // Report promptly when playback pauses so the server total stays accurate.
  useEffect(() => {
    if (view.status === "paused" || view.status === "idle" || view.status === "no_access") void flush();
  }, [view.status, flush]);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    if (fadeRef.current) fadeRef.current.setVolume(value);
    else if (audioRef.current) audioRef.current.volume = value;
  }, []);

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    if (ctlRef.current?.fadingOutPrevious) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, ratio * audio.duration));
  }, []);

  const dismiss = useCallback(async () => {
    const ctl = ctlRef.current;
    const audio = audioRef.current;
    const fader = fadeRef.current;
    setBarDismissed(true);
    if (ctl && (ctl.status === "playing" || ctl.status === "loading")) await ctl.toggle();
    // Let the fade-out finish; a play pressed meanwhile keeps the music.
    if (fader && fader.fadingOut && !(await fader.fadeOut())) return;
    if (ctl && (ctl.status === "playing" || ctl.status === "loading")) return;
    if (fader) fader.pause();
    else audio?.pause();
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
    setClock({ current: 0, duration: 0 });
  }, []);

  const attachStudio = useCallback(() => {
    setStudios((n) => n + 1);
    // Leaving the music page does NOT stop the music: only the bar moves to the shell.
    return () => setStudios((n) => n - 1);
  }, []);

  const value = useMemo<GuestPlayback>(() => ({
    audioRef, ctlRef, fadeRef, view, clock, volume, setVolume, seek, barDismissed, setBarDismissed, dismiss,
    limit, seedLimit, flush, atmosphere, setAtmosphere, attachStudio, setBarMeta,
  }), [view, clock, volume, setVolume, seek, barDismissed, dismiss, limit, seedLimit, flush, atmosphere, attachStudio]);

  const status = view.status;
  const barMeta: GuestBarMeta | null = barTracks && view.current
    ? (barTracks.get(view.current.audioItemId) ?? { title: view.current.title || "Музыка", coverSrc: null, duration: view.current.durationSeconds ?? 0 })
    : null;
  const shellBar = showGuestShellBar({ studioMounted: studios > 0, meta: barMeta, current: view.current, dismissed: barDismissed, status });
  const duration = clock.duration > 0 ? clock.duration : (barMeta?.duration ?? 0);

  return (
    <GuestPlaybackContext.Provider value={value}>
      {children}
      {shellBar && barMeta ? (
        <BusinessCabinetMiniBar
          title={barMeta.title}
          coverSrc={barMeta.coverSrc}
          playing={status === "playing"}
          loading={status === "loading"}
          onToggle={() => { setBarDismissed(false); void ctlRef.current?.toggle(); }}
          onNext={() => { setBarDismissed(false); void ctlRef.current?.next(); }}
          onClose={() => void dismiss()}
          onSeek={seek}
          currentTime={clock.current}
          duration={duration}
          timeLabel={`${formatPlaybackClock(clock.current)} / ${formatPlaybackClock(duration)}`}
          volume={volume}
          onVolume={setVolume}
          message={status === "no_access" ? null : view.message}
          testId="biz-player"
          progressTestId="biz-player-progress"
          openTestId="biz-player-open"
          closeTestId="biz-player-close"
          controlsPrefix="biz-player"
          ariaLabel="Плеер АудиоЛад Бизнес"
        />
      ) : null}
      {/* Outside every page: a route change never removes (and so never pauses) the element. */}
      <audio ref={audioRef} preload="none" playsInline data-testid="biz-guest-audio" />
    </GuestPlaybackContext.Provider>
  );
}
