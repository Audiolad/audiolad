"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DEFAULT_PROFILE,
  GUEST_COFFEE_DIRECTIONS,
  guestCoffeePlaylistMinutes,
  selectGuestCoffeePlaylists,
  type GuestCoffeePlaylist,
  type GuestCoffeeProfile,
} from "@/lib/business-app/guest-coffee/catalog";
import {
  GUEST_COFFEE_ATLAS_URL,
  GUEST_COFFEE_COPY,
  GUEST_COFFEE_INQUIRY_EMAIL,
  GUEST_COFFEE_PRICE,
  GUEST_COFFEE_RIGHTS_URL,
  GUEST_COFFEE_TERMS,
} from "@/lib/business-app/guest-coffee/copy";
import {
  GUEST_COFFEE_REPORT_INTERVAL_MS,
  GuestCoffeePlaybackMeter,
  type GuestCoffeeLimitState,
} from "@/lib/business-app/guest-coffee/limit";
import type { SpaManifestItem } from "@/lib/business-app/spa-manifest";
import { SpaOnlinePlayer as Controller, type OnlineStatus } from "@/lib/business-app/spa-online-player";

import "./guest-coffee.css";

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

function ChipGroup<T extends { id: string; label: string; hint?: string }>({
  legend,
  step,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  step: number;
  name: string;
  options: readonly T[];
  value: string;
  onChange: (id: T["id"]) => void;
}) {
  return (
    <fieldset className="gc-step">
      <legend className="gc-step__legend">
        <span className="gc-step__num" aria-hidden="true">
          {step}
        </span>
        {legend}
      </legend>
      <div className={options.length === 4 && options.every((o) => !o.hint && o.label.length <= 9) ? "gc-chips gc-chips--4" : "gc-chips"}>
        {options.map((option) => (
          <label key={option.id} className="gc-chip" data-checked={option.id === value ? "true" : undefined}>
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={option.id === value}
              onChange={() => onChange(option.id)}
            />
            <span className="gc-chip__label">{option.label}</span>
            {option.hint ? <span className="gc-chip__hint">{option.hint}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function GuestCoffeeCabinet({ playlists, initialLimit }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctlRef = useRef<Controller | null>(null);
  const meterRef = useRef(new GuestCoffeePlaybackMeter());
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const connectRef = useRef<HTMLButtonElement | null>(null);
  const [profile, setProfile] = useState<GuestCoffeeProfile>(GUEST_COFFEE_DEFAULT_PROFILE);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ status: "idle", current: null, message: null });
  const [limit, setLimit] = useState<GuestCoffeeLimitState>(initialLimit);
  const [connectOpen, setConnectOpen] = useState(false);

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

  // Connect dialog: focus, Escape, return focus.
  useEffect(() => {
    if (!connectOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConnectOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectOpen]);

  const closeConnect = () => {
    setConnectOpen(false);
    connectRef.current?.focus();
  };

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
    setProfile((prev) => ({ ...prev, [key]: value }));

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
    <div className="guest-coffee" data-testid="guest-coffee" data-limit={limit}>
      <header className="gc-header">
        <div className="gc-wrap gc-header__bar">
          <a href={GUEST_COFFEE_ATLAS_URL} className="gc-header__back" data-testid="gc-back-to-atlas">
            <span aria-hidden="true">←</span> Атлас<span className="gc-header__back-long"> кофеен</span>
          </a>
          <p className="gc-header__brand">
            АудиоЛад Бизнес <span className="gc-header__pill">гостевой режим</span>
          </p>
          <button
            ref={connectRef}
            type="button"
            className="gc-btn gc-btn--gold gc-header__connect"
            onClick={() => setConnectOpen(true)}
            data-testid="gc-connect"
          >
            Подключить
          </button>
        </div>
      </header>

      <main className="gc-wrap gc-main">
        <section className="gc-hero" aria-labelledby="gc-title">
          <p className="gc-kicker">Гостевой кабинет кофейни</p>
          <h1 id="gc-title" className="gc-hero__title">
            {GUEST_COFFEE_COPY.title}
          </h1>
          <p className="gc-hero__lead">{GUEST_COFFEE_COPY.lead}</p>
          <p className="gc-hero__note">
            {GUEST_COFFEE_COPY.limitNote}
          </p>
        </section>

        <div className="gc-layout">
          <section className="gc-card gc-setup" aria-label="Настройка звучания">
            <ChipGroup
              step={1}
              legend="Характер кофейни"
              name="gc-character"
              options={GUEST_COFFEE_CHARACTERS}
              value={profile.character}
              onChange={(id) => setAxis("character", id)}
            />
            <ChipGroup
              step={2}
              legend="Музыкальное направление"
              name="gc-direction"
              options={GUEST_COFFEE_DIRECTIONS}
              value={profile.direction}
              onChange={(id) => setAxis("direction", id)}
            />
            <ChipGroup
              step={3}
              legend="Время суток"
              name="gc-daypart"
              options={GUEST_COFFEE_DAYPARTS}
              value={profile.daypart}
              onChange={(id) => setAxis("daypart", id)}
            />
            <p className="gc-setup__hint">Меняйте настройки в любой момент — подборки обновляются сразу, музыка не прерывается.</p>
          </section>

          <section className="gc-results" aria-labelledby="gc-results-title" data-testid="gc-results">
            <h2 id="gc-results-title" className="gc-results__title">
              Подборки для вашей кофейни
            </h2>
            {showExhaustedPanel ? (
              <div className="gc-card gc-limit" role="status" data-testid="gc-limit-exhausted">
                <h3 className="gc-limit__title">{GUEST_COFFEE_COPY.exhaustedTitle}</h3>
                <p>{GUEST_COFFEE_COPY.exhaustedText}</p>
                <button type="button" className="gc-btn gc-btn--gold" onClick={() => setConnectOpen(true)}>
                  Подключить
                </button>
              </div>
            ) : null}
            {notice && !showExhaustedPanel ? (
              <p className="gc-notice" role="status" data-testid="gc-limit-notice">
                {notice}
              </p>
            ) : null}
            {playlists.length === 0 ? (
              <p className="gc-card gc-empty" data-testid="gc-empty">
                {GUEST_COFFEE_COPY.emptyShelf}
              </p>
            ) : (
              <>
                {selection.directionFallback ? <p className="gc-muted">{GUEST_COFFEE_COPY.directionFallback}</p> : null}
                <ul className="gc-list">
                  {selection.playlists.map((playlist) => {
                    const isActive = playlist.id === activeId;
                    const minutes = guestCoffeePlaylistMinutes(playlist);
                    const playingThis = isActive && isPlaying;
                    return (
                      <li key={playlist.id} className="gc-item" data-active={isActive ? "true" : undefined}>
                        <div className="gc-item__cover">
                          <ProductCoverThumbnail
                            slug={playlist.productSlug}
                            title={playlist.title}
                            coverUrl={playlist.coverUrl}
                            coverImage={playlist.coverImage}
                            updatedAt={playlist.updatedAt}
                            authorName={playlist.authorName}
                            format={playlist.format}
                            className="aspect-square w-full rounded-[14px]"
                          />
                        </div>
                        <div className="gc-item__meta">
                          <p className="gc-item__title">{playlist.title}</p>
                          <p className="gc-item__sub">
                            {playlist.authorName ? `${playlist.authorName} · ` : ""}
                            {playlist.tracks.length} {tracksWord(playlist.tracks.length)}
                            {minutes ? ` · ${minutes} мин` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="gc-btn gc-btn--play"
                          onClick={() => void playPlaylist(playlist)}
                          disabled={!isActive && !canStart}
                          aria-pressed={playingThis}
                          aria-label={`${playingThis ? "Пауза" : "Слушать"}: ${playlist.title}`}
                          data-testid="gc-play"
                        >
                          {playingThis ? (status === "loading" ? "…" : "Пауза") : "Слушать"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <p className="gc-muted gc-results__source">{GUEST_COFFEE_COPY.shelfSource}</p>
          </section>
        </div>

        <footer className="gc-foot">
          <p>
            {GUEST_COFFEE_COPY.evaluationOnly}{" "}
            <a href={GUEST_COFFEE_RIGHTS_URL}>Как устроены права на музыку</a>
          </p>
          <p>
            <a href={GUEST_COFFEE_ATLAS_URL}>← Вернуться в атлас кофеен</a>
          </p>
        </footer>
      </main>

      <div className="gc-player" data-testid="gc-player" data-status={status} aria-live="polite">
        <div className="gc-wrap gc-player__bar">
          {active && view.current ? (
            <>
              <div className="gc-player__now">
                <p className="gc-player__track" data-testid="gc-now">
                  {status === "loading" ? "Загрузка…" : view.current.title}
                </p>
                <p className="gc-player__list">{active.title}</p>
              </div>
              <div className="gc-player__controls">
                <button
                  type="button"
                  className="gc-btn gc-btn--round"
                  onClick={() => void ctlRef.current?.toggle()}
                  aria-label={isPlaying ? "Пауза" : "Играть"}
                  data-testid="gc-toggle"
                  disabled={!isPlaying && !canStart}
                >
                  {isPlaying ? "❚❚" : "▶"}
                </button>
                <button
                  type="button"
                  className="gc-btn gc-btn--ghost"
                  onClick={() => void ctlRef.current?.next()}
                  aria-label="Следующий трек"
                  data-testid="gc-next"
                  disabled={!canStart}
                >
                  ⏭
                </button>
              </div>
            </>
          ) : (
            <p className="gc-player__idle">Выберите подборку и нажмите «Слушать» — музыка заиграет здесь.</p>
          )}
          {playerMessage ? (
            <p className="gc-player__msg" role="alert">
              {playerMessage}
            </p>
          ) : null}
        </div>
      </div>

      {connectOpen ? (
        <div className="gc-dialog__backdrop" onClick={closeConnect}>
          <div
            className="gc-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gc-connect-title"
            data-testid="gc-connect-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="gc-connect-title" className="gc-dialog__title">
              {GUEST_COFFEE_COPY.connectTitle}
            </h2>
            <p className="gc-dialog__price">
              {GUEST_COFFEE_PRICE}
              <span> / месяц</span>
            </p>
            <p className="gc-dialog__terms">{GUEST_COFFEE_TERMS}.</p>
            <p>{GUEST_COFFEE_COPY.connectStage}</p>
            <p>
              {GUEST_COFFEE_COPY.connectContact}{" "}
              <a href={`mailto:${GUEST_COFFEE_INQUIRY_EMAIL}`}>{GUEST_COFFEE_INQUIRY_EMAIL}</a>
            </p>
            <p className="gc-muted">
              <a href={GUEST_COFFEE_RIGHTS_URL}>Как устроены права на музыку</a>
            </p>
            <button ref={closeRef} type="button" className="gc-btn gc-btn--dark" onClick={closeConnect}>
              Понятно
            </button>
          </div>
        </div>
      ) : null}

      <audio ref={audioRef} preload="none" playsInline />
    </div>
  );
}
