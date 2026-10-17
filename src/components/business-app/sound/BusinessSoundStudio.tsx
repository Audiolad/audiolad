"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { useBusinessGuestStatus } from "@/components/business-app/BusinessGuestStatus";
import BusinessPlayerControls from "@/components/business-app/BusinessPlayerControls";
import BusinessSoundSettings from "@/components/business-app/sound/BusinessSoundSettings";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { BUSINESS_CONNECT_HREF, resolveBusinessAccess } from "@/lib/business-app/access";
import {
  GUEST_COFFEE_DEFAULT_PROFILE,
  guestCoffeePlaylistMinutes,
  selectGuestCoffeePlaylists,
  type GuestCoffeePlaylist,
  type GuestCoffeeProfile,
} from "@/lib/business-app/guest-coffee/catalog";
import { GUEST_COFFEE_ATLAS_URL, GUEST_COFFEE_COPY, GUEST_COFFEE_RIGHTS_URL } from "@/lib/business-app/guest-coffee/copy";
import {
  GUEST_COFFEE_REPORT_INTERVAL_MS,
  GuestCoffeePlaybackMeter,
  type GuestCoffeeLimitState,
} from "@/lib/business-app/guest-coffee/limit";
import {
  BUSINESS_SOUND_PROFILE_STORAGE_KEY,
  parseBusinessSoundProfile,
  serializeBusinessSoundProfile,
} from "@/lib/business-app/sound-profile";
import type { SpaManifestItem } from "@/lib/business-app/spa-manifest";
import { SpaOnlinePlayer as Controller, type OnlineStatus } from "@/lib/business-app/spa-online-player";

/**
 * a8240527 — Music section of the AudioLad Business cabinet: sound settings, collections and
 * the Business player. Rendered inside the shared BusinessAppShell for the guest
 * (https://business.audiolad.ru/guest/coffee) and for the owner (/music) alike.
 *
 * Collections are free public catalogue albums for PRIVATE evaluation listening, metered on
 * the server (30 minutes, /api/business/guest/coffee/*). They are not the venue airplay
 * catalogue: airplay is the point's program player with rights-confirmed tracks only.
 */
type Props = {
  playlists: GuestCoffeePlaylist[];
  initialLimit: GuestCoffeeLimitState;
};

type View = { status: OnlineStatus; current: SpaManifestItem | null; message: string | null };

const JSON_POST = { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store" } as const;

function toItems(playlist: GuestCoffeePlaylist): SpaManifestItem[] {
  return playlist.tracks.map((t, position) => ({
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

function tracksWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "трек";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "трека";
  return "треков";
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

export default function BusinessSoundStudio({ playlists, initialLimit }: Props) {
  const access = resolveBusinessAccess(useBusinessDomain());
  const guest = access.level === "guest";
  const { setLimit: reportLimitToShell } = useBusinessGuestStatus();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctlRef = useRef<Controller | null>(null);
  const meterRef = useRef(new GuestCoffeePlaybackMeter());
  // SSR renders the default profile; the device's saved settings are applied after mount.
  const [profile, setProfile] = useState<GuestCoffeeProfile>(GUEST_COFFEE_DEFAULT_PROFILE);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ status: "idle", current: null, message: null });
  const [limit, setLimit] = useState<GuestCoffeeLimitState>(initialLimit);

  useEffect(() => {
    const stored = readStoredProfile();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from device storage
    setProfile((prev) => (serializeBusinessSoundProfile(prev) === serializeBusinessSoundProfile(stored) ? prev : stored));
  }, []);

  useEffect(() => reportLimitToShell(limit), [limit, reportLimitToShell]);

  const selection = useMemo(() => selectGuestCoffeePlaylists(playlists, profile), [playlists, profile]);
  const active = useMemo(() => playlists.find((p) => p.id === activeId) ?? null, [playlists, activeId]);

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
          if (c) setView({ status: c.status, current: c.current, message: c.message });
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

  const playPlaylist = async (playlist: GuestCoffeePlaylist) => {
    const ctl = ctlRef.current;
    if (!ctl) return;
    if (activeId === playlist.id && ctl.items.length > 0) {
      await ctl.toggle();
      return;
    }
    if (!canStart) return;
    setActiveId(playlist.id);
    await ctl.applyManifest(toItems(playlist));
    if (ctl.status !== "playing" && ctl.status !== "loading") await ctl.playIndex(0);
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

  return (
    <div className="business-sound" data-testid="biz-sound" data-limit={limit} data-access={access.level}>
      <div className="business-sound-layout">
        <BusinessSoundSettings profile={profile} onChange={setAxis} note={GUEST_COFFEE_COPY.settingsSaved} />

        <section className="business-sound-results" aria-labelledby="business-sound-results-title" data-testid="biz-sound-results">
          <h2 id="business-sound-results-title" className="text-[1.15rem] font-bold text-[var(--biz-text)]">
            Подборки для знакомства со звучанием
          </h2>
          {showExhaustedPanel ? (
            <div className="business-app-card business-sound-limit" role="status" data-testid="biz-sound-exhausted">
              <h3 className="text-[1.05rem] font-bold text-[var(--biz-text)]">{GUEST_COFFEE_COPY.exhaustedTitle}</h3>
              <p className="mt-1 text-[var(--biz-text-muted)]">{guest ? GUEST_COFFEE_COPY.exhaustedText : GUEST_COFFEE_COPY.exhaustedMember}</p>
              {guest ? (
                <Link href={BUSINESS_CONNECT_HREF} className="mt-3 business-app-btn business-app-btn-primary business-app-focus-ring">
                  Подключить
                </Link>
              ) : null}
            </div>
          ) : null}
          {notice && !showExhaustedPanel ? (
            <p className="business-app-alert" data-tone="warn" role="status" data-testid="biz-sound-notice">
              {notice}
            </p>
          ) : null}
          {playlists.length === 0 ? (
            <p className="business-app-card text-[var(--biz-text-muted)]" data-testid="biz-sound-empty">
              {GUEST_COFFEE_COPY.emptyShelf}
            </p>
          ) : (
            <>
              {selection.directionFallback ? <p className="business-app-muted">{GUEST_COFFEE_COPY.directionFallback}</p> : null}
              <ul className="business-sound-list">
                {selection.playlists.map((playlist) => {
                  const isActive = playlist.id === activeId;
                  const minutes = guestCoffeePlaylistMinutes(playlist);
                  const playingThis = isActive && isPlaying;
                  return (
                    <li key={playlist.id} className="business-app-card business-sound-item" data-active={isActive ? "true" : undefined}>
                      <div className="business-sound-item__cover">
                        <ProductCoverThumbnail
                          slug={playlist.productSlug}
                          title={playlist.title}
                          coverUrl={playlist.coverUrl}
                          coverImage={playlist.coverImage}
                          updatedAt={playlist.updatedAt}
                          authorName={playlist.authorName}
                          format={playlist.format}
                          className="aspect-square w-full rounded-[12px]"
                        />
                      </div>
                      <div className="business-sound-item__meta">
                        <p className="business-sound-item__title" data-testid="biz-sound-title">{playlist.title}</p>
                        <p className="business-app-muted text-sm">
                          {playlist.authorName ? `${playlist.authorName} · ` : ""}
                          {playlist.tracks.length} {tracksWord(playlist.tracks.length)}
                          {minutes ? ` · ${minutes} мин` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="business-app-btn business-app-btn-primary business-app-focus-ring"
                        onClick={() => void playPlaylist(playlist)}
                        disabled={!isActive && !canStart}
                        aria-pressed={playingThis}
                        aria-label={`${playingThis ? "Пауза" : "Слушать"}: ${playlist.title}`}
                        data-testid="biz-sound-listen"
                      >
                        {playingThis ? (status === "loading" ? "…" : "Пауза") : "Слушать"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <p className="business-app-muted text-sm">{GUEST_COFFEE_COPY.shelfSource}</p>
          <p className="business-app-muted text-sm">
            {GUEST_COFFEE_COPY.evaluationOnly} <a className="underline" href={GUEST_COFFEE_RIGHTS_URL}>Как устроены права на музыку</a>
          </p>
          {guest ? (
            <p className="text-sm">
              <a className="underline" href={GUEST_COFFEE_ATLAS_URL} data-testid="biz-back-to-atlas">
                ← Вернуться в атлас кофеен
              </a>
            </p>
          ) : null}
        </section>
      </div>

      <section className="business-app-card business-sound-player" aria-label="Плеер АудиоЛад Бизнес" data-testid="biz-player" data-status={status} aria-live="polite">
        {active && view.current ? (
          <>
            <p className="business-sound-player__list business-app-muted text-sm">{active.title}</p>
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
          <p className="business-app-muted">Выберите подборку и нажмите «Слушать» – музыка заиграет здесь.</p>
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
