"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import BusinessPlayerControls from "@/components/business-app/BusinessPlayerControls";
import {
  BUSINESS_EMPTY_CATALOG_NOTE,
  BUSINESS_GIFT_CTA,
  BUSINESS_GIFT_TITLE,
  BUSINESS_SPACE_CLOSED_NOTE,
  BUSINESS_STORE_UNAVAILABLE_NOTE,
  BUSINESS_SUBSCRIPTION_NOTE,
  BUSINESS_UNCONFIRMED_NOTE,
  BUSINESS_WORKSPACE_AUTOPLAY_NOTE,
} from "@/lib/access-grants/copy";
import { ruDaysWord } from "@/lib/access-grants/policy";
import type { SpaManifestItem } from "@/lib/business-app/spa-manifest";
import { SpaOnlinePlayer as Controller, type OnlineStatus } from "@/lib/business-app/spa-online-player";
import { workspacePlayerOpen, type WorkspacePageModel, type WorkspaceTrack } from "@/lib/business-workspace/model";
import {
  clampWorkspacePlayback,
  newerPlayback,
  playbackStorageKey,
  type WorkspacePlayback,
} from "@/lib/business-workspace/playback";

type View = { status: OnlineStatus; title: string | null; message: string | null; index: number };

const JSON_POST = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "same-origin" as const,
  cache: "no-store" as const,
};

function toItems(tracks: readonly WorkspaceTrack[]): SpaManifestItem[] {
  return tracks.map((track, position) => ({
    position,
    audioItemId: track.audioItemId,
    trackCode: null,
    title: track.title,
    durationSeconds: track.durationSeconds,
    gainDb: null,
    playableUntil: null,
    offlineAllowed: false,
    offlineCacheUntil: null,
  }));
}

function readLocal(spaceId: string, trackCount: number): WorkspacePlayback | null {
  try {
    const raw = window.localStorage.getItem(playbackStorageKey(spaceId));
    if (!raw) return null;
    return clampWorkspacePlayback(JSON.parse(raw) as Partial<WorkspacePlayback>, trackCount);
  } catch {
    return null;
  }
}

function writeLocal(spaceId: string, playback: WorkspacePlayback): void {
  try {
    window.localStorage.setItem(playbackStorageKey(spaceId), JSON.stringify(playback));
  } catch {
    // Private mode: the server copy is still posted when the network works.
  }
}

export default function BusinessWorkspace({ model }: { model: WorkspacePageModel }) {
  const open = workspacePlayerOpen(model);
  const canPlay = open && model.tracks.length > 0;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctlRef = useRef<Controller | null>(null);
  const initialPlayback = clampWorkspacePlayback(model.playback, model.tracks.length);
  const playbackRef = useRef<WorkspacePlayback>(initialPlayback);
  const seekRef = useRef(initialPlayback.positionSec);
  const lastPostRef = useRef(0);
  const [playback, setPlayback] = useState(initialPlayback);
  const [view, setView] = useState<View>({ status: "idle", title: null, message: null, index: initialPlayback.index });
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [offerNoted, setOfferNoted] = useState(false);

  useEffect(() => {
    const local = readLocal(model.spaceId, model.tracks.length);
    const chosen = newerPlayback(local, model.playback ? clampWorkspacePlayback(model.playback, model.tracks.length) : null);
    if (!chosen) return;
    playbackRef.current = chosen;
    seekRef.current = chosen.positionSec;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- local snapshot is read after mount so server HTML stays the hydration source
    setPlayback(chosen);
  }, [model.playback, model.spaceId, model.tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !canPlay) return;
    audio.volume = playback.volume;
  }, [canPlay, playback.volume]);

  const remember = (patch: Partial<WorkspacePlayback>, play: boolean, silent = false) => {
    const next = clampWorkspacePlayback(
      { ...playbackRef.current, ...patch, updatedAt: new Date().toISOString() },
      model.tracks.length,
    );
    playbackRef.current = next;
    if (!silent) setPlayback(next);
    writeLocal(model.spaceId, next);
    const now = Date.now();
    if (!play && now - lastPostRef.current < 15_000) return;
    lastPostRef.current = now;
    const params = new URLSearchParams({ space: model.spaceId });
    void fetch(`/api/business/workspace/state?${params.toString()}`, {
      ...JSON_POST,
      body: JSON.stringify({
        kind: "playback",
        index: next.index,
        positionSec: next.positionSec,
        volume: next.volume,
        play,
      }),
    })
      .then((res) => {
        if (!res.ok) setSaveNote("Не удалось сохранить место на сервере. На этом устройстве оно сохранено.");
        else setSaveNote(null);
      })
      .catch(() => {
        setSaveNote("Нет соединения. Место в подборке сохранено на этом устройстве и отправится, когда связь вернётся.");
      });
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !canPlay) return;
    const ctl = new Controller(
      {
        audio,
        sign: async (audioItemId) => {
          try {
            const params = new URLSearchParams({ space: model.spaceId });
            const res = await fetch(`/api/business/workspace/track-url?${params.toString()}`, {
              ...JSON_POST,
              body: JSON.stringify({ audioItemId }),
            });
            const json = (await res.json()) as { ok?: boolean; data?: { url?: string }; reason?: string };
            if (json.ok === true && typeof json.data?.url === "string") return { ok: true, data: { url: json.data.url } };
            return { ok: false, reason: json.reason || "network" };
          } catch {
            return { ok: false, reason: "network" };
          }
        },
        onChange: () => {
          const current = ctlRef.current;
          if (!current) return;
          setView({
            status: current.status,
            title: current.current?.title ?? null,
            message: current.message,
            index: current.index,
          });
        },
      },
      toItems(model.tracks),
    );
    ctlRef.current = ctl;
    const onTime = () => {
      if (audio.paused) return;
      remember({ index: ctl.index < 0 ? playbackRef.current.index : ctl.index, positionSec: audio.currentTime }, false, true);
    };
    const onEnded = () => void ctl.onEnded();
    const onError = () => void ctl.onError();
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      ctl.dispose();
      ctlRef.current = null;
    };
    // remember is recreated each render; the controller must not restart on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, model.spaceId, model.tracks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || view.status !== "playing" || seekRef.current <= 0.5) return;
    const target = seekRef.current;
    seekRef.current = 0;
    if (Number.isFinite(audio.duration) && target < audio.duration) audio.currentTime = target;
  }, [view.status]);

  const play = async () => {
    const ctl = ctlRef.current;
    if (!ctl) return;
    const index = playbackRef.current.index;
    if (ctl.status === "playing" || ctl.status === "loading") {
      await ctl.toggle();
      remember({ index: ctl.index, positionSec: audioRef.current?.currentTime ?? 0 }, false);
      return;
    }
    if (ctl.status === "paused" && ctl.current) {
      await ctl.toggle();
    } else {
      await ctl.playIndex(index);
    }
    remember({ index: ctl.index < 0 ? index : ctl.index, positionSec: audioRef.current?.currentTime ?? playbackRef.current.positionSec }, true);
  };

  const next = async () => {
    const ctl = ctlRef.current;
    if (!ctl) return;
    seekRef.current = 0;
    await ctl.next();
    remember({ index: ctl.index < 0 ? 0 : ctl.index, positionSec: 0 }, true);
  };

  const offer = () => {
    setOfferNoted(true);
    const params = new URLSearchParams({ space: model.spaceId });
    void fetch(`/api/business/workspace/state?${params.toString()}`, {
      ...JSON_POST,
      body: JSON.stringify({ kind: "offer_click" }),
    }).catch(() => {
      setSaveNote("Нет соединения. Кнопка подписки остаётся на этом экране, списание не начинается.");
    });
  };

  const playing = view.status === "playing" || view.status === "loading";

  return (
    <div className="business-app-span-full mx-auto max-w-3xl space-y-4" data-testid="biz-workspace" data-space={model.spaceId} data-status={model.status}>
      <header>
        <p className="business-app-eyebrow">{BUSINESS_GIFT_TITLE}</p>
        <h1 className="mt-1 text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)]">{model.spaceTitle}</h1>
        {model.status === "trial" && model.daysLeft !== null ? (
          <p className="mt-2 text-[1.15rem] font-bold text-[var(--biz-text)]" data-testid="biz-workspace-days">
            Осталось {model.daysLeft} {ruDaysWord(model.daysLeft)}
            {model.endsAtLabel ? <span className="mt-1 block text-base font-normal text-[var(--biz-text-muted)]" data-testid="biz-workspace-until">до {model.endsAtLabel}</span> : null}
          </p>
        ) : null}
        {model.status === "paid" && model.endsAtLabel ? (
          <p className="mt-2 text-[var(--biz-text-muted)]" data-testid="biz-workspace-paid-until">Подписка до {model.endsAtLabel}</p>
        ) : null}
      </header>

      <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-workspace-rules">{model.rules}</p>

      {model.status === "anonymous" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-anonymous">
          <p>Чтобы открыть кабинет, подтвердите email. Карта не нужна.</p>
          <div className="flex flex-wrap gap-2">
            <a className="business-app-btn business-app-btn-primary business-app-focus-ring" href={model.signUpHref} data-testid="biz-workspace-signup">
              {BUSINESS_GIFT_CTA}
            </a>
            <a className="business-app-btn business-app-btn-secondary business-app-focus-ring" href={model.signInHref}>
              Войти
            </a>
          </div>
        </section>
      ) : null}

      {model.status === "unconfirmed" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-unconfirmed">
          <p>{BUSINESS_UNCONFIRMED_NOTE}</p>
          <p className="flex flex-wrap gap-3">
            <a className="underline" href={model.signInHref}>Войти после подтверждения</a>
            <Link className="underline" href={model.helpHref}>Письмо не пришло</Link>
          </p>
        </section>
      ) : null}

      {model.status === "unavailable" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-unavailable">
          <p>{BUSINESS_STORE_UNAVAILABLE_NOTE}</p>
          <Link className="underline" href="/help">Открыть помощь</Link>
        </section>
      ) : null}

      {!model.spaceEnabled ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-closed-space">
          <p>{BUSINESS_SPACE_CLOSED_NOTE}</p>
          <Link className="underline" href={model.cafeHref}>Открыть «Кафе, рестораны и отели»</Link>
        </section>
      ) : null}

      {model.status === "offer" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-offer">
          <h2 className="text-[1.15rem] font-bold">Подписка {model.priceLabel} {model.periodLabel}</h2>
          {model.endsAtLabel ? <p data-testid="biz-workspace-ended">Подарочный период закончился {model.endsAtLabel}.</p> : null}
          <p>{BUSINESS_SUBSCRIPTION_NOTE}</p>
          <button type="button" className="business-app-btn business-app-btn-primary business-app-focus-ring" onClick={offer} data-testid="biz-workspace-subscribe">
            Оформить подписку
          </button>
          {offerNoted ? <p data-testid="biz-workspace-offer-noted">Запрос отмечен. Деньги не списываются.</p> : null}
        </section>
      ) : null}

      {showEmpty(model) ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-empty">
          <p>{BUSINESS_EMPTY_CATALOG_NOTE}</p>
          <p className="flex flex-wrap gap-3">
            <a className="underline" href={model.rightsHref}>Как устроены права на музыку</a>
            <Link className="underline" href={model.onboardingHref}>Подключение точки</Link>
          </p>
        </section>
      ) : null}

      {canPlay ? (
        <section className="business-app-card business-workspace-player" aria-label="Плеер кабинета" data-testid="biz-workspace-player">
          <p className="text-sm text-[var(--biz-text-muted)]">{BUSINESS_WORKSPACE_AUTOPLAY_NOTE}</p>
          <ol className="business-atmosphere-tracks" data-testid="biz-workspace-tracks">
            {model.tracks.map((track, index) => (
              <li key={track.audioItemId} data-current={view.index === index ? "true" : undefined}>
                <button
                  type="button"
                  className="business-atmosphere-track business-app-focus-ring"
                  onClick={() => {
                    seekRef.current = 0;
                    void ctlRef.current?.playIndex(index).then(() => remember({ index, positionSec: 0 }, true));
                  }}
                >
                  <span>{index + 1}</span>
                  <span>{track.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <BusinessPlayerControls
            testIdPrefix="biz-workspace"
            playing={view.status === "playing"}
            loading={view.status === "loading"}
            nowTitle={view.title}
            onToggle={() => void play()}
            onNext={() => void next()}
            pauseLabel="Стоп"
            volume={playback.volume}
            onVolume={(value) => remember({ volume: value }, false)}
          />
          {view.message ? (
            <p className="business-app-alert mt-2" data-tone="warn" role="alert" data-testid="biz-workspace-player-message">
              {view.message}
            </p>
          ) : null}
          {saveNote ? <p className="mt-2 text-sm text-[var(--biz-text-muted)]" data-testid="biz-workspace-save-note">{saveNote}</p> : null}
          {playing ? null : <p className="mt-2 text-sm text-[var(--biz-text-muted)]">Сейчас пауза. Подборка продолжается с сохранённого места после «Играть».</p>}
        </section>
      ) : null}

      {canPlay ? <audio ref={audioRef} preload="none" playsInline data-testid="biz-workspace-audio" /> : null}
    </div>
  );
}

function showEmpty(model: WorkspacePageModel): boolean {
  return workspacePlayerOpen(model) && model.tracks.length === 0;
}
