"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import BusinessPlayerControls from "@/components/business-app/BusinessPlayerControls";
import { cabinetAlbumCoverUrl } from "@/lib/business-app/album-cover";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { getCabinetDeviceSecret, postCabinetReport } from "@/lib/business-app/cabinet-player-client";
import { formatPlaybackClock } from "@/lib/business-app/playback-clock";
import { SpaOnlinePlayer as Controller, type OnlineStatus } from "@/lib/business-app/spa-online-player";
import { deriveSpaPlaybackState, sendSpaLiveReport, SpaLiveEvidence } from "@/lib/business-app/spa-live-report";
import { peekAtmosphereRestart } from "@/lib/business-app/cafe-queue/atmosphere-restart";
import { cafeQueueIndices, cafeQueueNextIndex } from "@/lib/business-app/cafe-queue/order";
import type { CafeDaypart, CafeQueueFeedback } from "@/lib/business-app/cafe-queue/prefs";
import type { GuestCoffeeCharacter, GuestCoffeeDirection } from "@/lib/business-app/guest-coffee/catalog";
import { BUSINESS_SOUND_PROFILE_STORAGE_KEY, parseBusinessSoundProfile } from "@/lib/business-app/sound-profile";
import {
  clampWorkspacePlayback,
  newerPlayback,
  playbackStorageKey,
  type WorkspacePlayback,
} from "@/lib/business-workspace/playback";
import { workspaceAtmosphereStartIndex } from "@/lib/business-workspace/shelves";
import {
  workspaceDeadlineDelay,
  workspaceItems,
  workspacePlaybackAllowed,
  workspacePlayerOpen,
  type WorkspacePageModel,
} from "@/lib/business-workspace/model";

type View = {
  status: OnlineStatus;
  message: string | null;
  index: number;
  currentTime: number;
  duration: number;
};

type CabinetPlayerApi = {
  adopt: (model: WorkspacePageModel) => void;
  release: () => void;
  view: View;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  playIndex: (index: number) => Promise<void>;
  setVolume: (value: number) => void;
  /** Scrub the current track. `ratio` is 0–1 of the known duration. */
  seek: (ratio: number) => void;
  volume: number;
  saveNote: string | null;
  /** Catalog indices in play order. Null until the cafe queue answers: catalog order. */
  queueOrder: readonly number[] | null;
  setQueueOrder: (indices: readonly number[]) => void;
  /** Jump to the first track of a queue just built by «Создать атмосферу». */
  applyAtmosphereQueue: (indices: readonly number[], options: { play: boolean }) => void;
  /**
   * Rebuild the live queue for the stored sound profile.
   * Applied: the catalog was reordered, and a playing track moved to the new first row.
   * Deferred: this visit has no catalog yet, so the music page rebuilds on open.
   * Failed: the queue did not answer. A newer call supersedes this one.
   */
  rebuildFromProfile: (input: {
    character: GuestCoffeeCharacter;
    direction: GuestCoffeeDirection;
    daypart: CafeDaypart;
    feedback: readonly CafeQueueFeedback[];
  }) => Promise<"applied" | "deferred" | "failed">;
  cancelAtmosphereRebuild: () => void;
};

const CabinetContext = createContext<CabinetPlayerApi | null>(null);

export function useCabinetPlayerOptional(): CabinetPlayerApi | null {
  return useContext(CabinetContext);
}

export function useCabinetPlayer(): CabinetPlayerApi {
  const api = useCabinetPlayerOptional();
  if (!api) throw new Error("cabinet_player_missing");
  return api;
}

/** Player errors still say «Играть» for the text button. The venue bar shows the round control. */
export function musicPlayerMessage(message: string): string {
  return message.replaceAll("«Играть»", "круглую кнопку");
}

const JSON_POST = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "same-origin" as const,
  cache: "no-store" as const,
};

function modelKey(model: WorkspacePageModel): string {
  return `${model.spaceId}|${model.endsAt ?? ""}|${model.tracks.map((track) => track.audioItemId).join(",")}`;
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
    /* private mode */
  }
}

function deviceSecret(): string {
  const storage = typeof window === "undefined" ? null : window.sessionStorage;
  const random = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
  return getCabinetDeviceSecret(storage, random);
}

export function BusinessCabinetPlayerProvider({
  initialModel = null,
  children,
}: {
  initialModel?: WorkspacePageModel | null;
  children: ReactNode;
}) {
  const domain = useBusinessDomain();
  const [model, setModel] = useState<WorkspacePageModel | null>(initialModel);
  const modelRef = useRef(model);
  useLayoutEffect(() => {
    modelRef.current = model;
  }, [model]);
  const open = Boolean(model && workspacePlayerOpen(model) && model.tracks.length > 0);
  const initialPlayback = clampWorkspacePlayback(model?.playback ?? null, model?.tracks.length ?? 0);
  const playbackRef = useRef<WorkspacePlayback>(initialPlayback);
  const seekRef = useRef(initialPlayback.positionSec);
  const lastPostRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const ctlRef = useRef<Controller | null>(null);
  const evidenceRef = useRef(new SpaLiveEvidence());
  const [playback, setPlayback] = useState(initialPlayback);
  const [view, setView] = useState<View>({
    status: "idle",
    message: null,
    index: initialPlayback.index,
    currentTime: initialPlayback.positionSec,
    duration: model?.tracks[initialPlayback.index]?.durationSeconds ?? 0,
  });
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [barDismissed, setBarDismissed] = useState(false);
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const [queueOrder, setQueueOrderState] = useState<number[] | null>(null);
  const restoredKey = useRef<string | null>(null);
  const reportRef = useRef<() => void>(() => {});
  const playOrderRef = useRef<number[] | null>(null);
  const savedPlaceRef = useRef(false);
  const rebuildGen = useRef(0);

  const adopt = useCallback((next: WorkspacePageModel) => {
    if (next.tracks.length === 0) return;
    const key = modelKey(next);
    modelRef.current = next;
    setModel((prev) => (prev && modelKey(prev) === key ? prev : next));
    const restart = peekAtmosphereRestart();
    if (restart) savedPlaceRef.current = false;
    if (restoredKey.current === key && !restart) return;
    restoredKey.current = key;
    if (restart) return;
    playOrderRef.current = null;
    setQueueOrderState(null);
    const count = next.tracks.length;
    const local = readLocal(next.spaceId, count);
    const server = next.playback ? clampWorkspacePlayback(next.playback, count) : null;
    const chosen = newerPlayback(local, server);
    if (chosen) {
      savedPlaceRef.current = true;
      playbackRef.current = chosen;
      seekRef.current = chosen.positionSec;
      setPlayback(chosen);
      setView((prev) => ({ ...prev, index: chosen.index }));
      return;
    }
    savedPlaceRef.current = false;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (!stored) return;
    const index = workspaceAtmosphereStartIndex(next.tracks, parseBusinessSoundProfile(stored).direction);
    if (index <= 0) return;
    const restored = clampWorkspacePlayback(
      { index, positionSec: 0, volume: playbackRef.current.volume, updatedAt: playbackRef.current.updatedAt },
      count,
    );
    playbackRef.current = restored;
    seekRef.current = 0;
    setPlayback(restored);
    setView((prev) => ({ ...prev, index }));
  }, []);

  const release = useCallback(() => {
    void ctlRef.current?.applyManifest(null);
    audioRef.current?.pause();
    setModel(null);
    restoredKey.current = null;
  }, []);

  const remember = useCallback((patch: Partial<WorkspacePlayback>, play: boolean, silent = false) => {
    const current = modelRef.current;
    if (!current) return;
    const next = clampWorkspacePlayback(
      { ...playbackRef.current, ...patch, updatedAt: new Date().toISOString() },
      current.tracks.length,
    );
    playbackRef.current = next;
    if (!silent) setPlayback(next);
    writeLocal(current.spaceId, next);
    const now = Date.now();
    if (!play && now - lastPostRef.current < 15_000) return;
    lastPostRef.current = now;
    const params = new URLSearchParams({ space: current.spaceId });
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
        setSaveNote(res.ok ? null : "Не удалось сохранить место на сервере. На этом устройстве оно сохранено.");
      })
      .catch(() => {
        setSaveNote("Нет соединения. Место в подборке сохранено на этом устройстве и отправится, когда связь вернётся.");
      });
  }, []);

  const canBeat = domain.status === "authenticated" && Boolean(domain.location);
  const reportPlayback = useCallback(() => {
    if (!canBeat) return;
    const audio = audioRef.current;
    const ctl = ctlRef.current;
    if (!audio || !ctl) return;
    const state = deriveSpaPlaybackState(ctl.status, { paused: audio.paused, ended: audio.ended }, Boolean(ctl.current));
    const report = evidenceRef.current.report(state, ctl.current?.audioItemId ?? null, Date.now());
    sendSpaLiveReport(
      (live) => postCabinetReport({ kind: "playback", deviceSecret: deviceSecret(), report: live }),
      report,
    );
  }, [canBeat]);
  useLayoutEffect(() => {
    reportRef.current = reportPlayback;
  }, [reportPlayback]);

  useEffect(() => {
    if (!canBeat) return;
    const beat = () => {
      void postCabinetReport({ kind: "heartbeat", deviceSecret: deviceSecret() });
    };
    beat();
    const timer = window.setInterval(beat, 30_000);
    return () => window.clearInterval(timer);
  }, [canBeat]);

  const catalogKey = model && open ? modelKey(model) : "";

  useEffect(() => {
    const audio = audioRef.current;
    const current = modelRef.current;
    if (!audio || !open || !current || !catalogKey) return;
    const ctl = new Controller(
      {
        audio,
        sign: async (audioItemId) => {
          try {
            const params = new URLSearchParams({ space: modelRef.current?.spaceId ?? "cafe" });
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
        nextIndex: (currentIndex, length) => cafeQueueNextIndex(playOrderRef.current, currentIndex, length),
        onChange: () => {
          const current = ctlRef.current;
          if (!current) return;
          setView((prev) => ({
            ...prev,
            status: current.status,
            message: current.message,
            index: current.index < 0 ? prev.index : current.index,
          }));
        },
      },
      workspaceItems(current.tracks, current.endsAt),
    );
    ctlRef.current = ctl;
    const onTime = () => {
      evidenceRef.current.onTimeUpdate(audio.currentTime, Date.now(), audio.paused);
      setView((prev) => ({
        ...prev,
        currentTime: audio.currentTime,
        duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : prev.duration,
      }));
      if (audio.paused) return;
      remember({ index: ctl.index < 0 ? playbackRef.current.index : ctl.index, positionSec: audio.currentTime }, false, true);
    };
    const sendReport = () => reportRef.current();
    const onPlaying = () => {
      evidenceRef.current.onPlaying(audio.currentTime);
      sendReport();
    };
    const onEnded = () => void ctl.onEnded();
    const onError = () => void ctl.onError();
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", sendReport);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    const reportTimer = window.setInterval(sendReport, 15_000);
    return () => {
      window.clearInterval(reportTimer);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", sendReport);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      ctl.dispose();
      ctlRef.current = null;
    };
  }, [catalogKey, open, remember]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !open) return;
    audio.volume = playback.volume;
  }, [open, playback.volume]);

  useEffect(() => {
    if (!model || !workspacePlayerOpen(model)) return;
    let timer: ReturnType<typeof setTimeout>;
    let expired = false;
    const check = () => {
      if (expired) return;
      if (workspacePlaybackAllowed(model.endsAt, Date.now())) {
        clearTimeout(timer);
        timer = setTimeout(check, workspaceDeadlineDelay(model.endsAt, Date.now()));
        return;
      }
      expired = true;
      void ctlRef.current?.applyManifest(null);
      audioRef.current?.pause();
    };
    timer = setTimeout(check, workspaceDeadlineDelay(model.endsAt, Date.now()));
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [model]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || view.status !== "playing" || seekRef.current <= 0.5) return;
    const target = seekRef.current;
    seekRef.current = 0;
    if (Number.isFinite(audio.duration) && target < audio.duration) audio.currentTime = target;
  }, [view.status]);

  const toggle = useCallback(async () => {
    const ctl = ctlRef.current;
    const current = modelRef.current;
    if (!ctl || !current || !workspacePlaybackAllowed(current.endsAt, Date.now())) return;
    const index = playbackRef.current.index;
    const starting = ctl.status !== "playing" && ctl.status !== "loading";
    if (starting) setBarDismissed(false);
    if (ctl.status === "playing" || ctl.status === "loading") {
      await ctl.toggle();
    } else if (ctl.status === "paused" && ctl.current) {
      await ctl.toggle();
    } else {
      await ctl.playIndex(index);
    }
    remember({ index: ctl.index < 0 ? index : ctl.index, positionSec: audioRef.current?.currentTime ?? 0 }, ctl.status === "playing");
    reportPlayback();
  }, [remember, reportPlayback]);

  const next = useCallback(async () => {
    const ctl = ctlRef.current;
    const current = modelRef.current;
    if (!ctl || !current || !workspacePlaybackAllowed(current.endsAt, Date.now())) return;
    setBarDismissed(false);
    seekRef.current = 0;
    evidenceRef.current.reset(0);
    await ctl.next();
    remember({ index: ctl.index < 0 ? 0 : ctl.index, positionSec: 0 }, true);
    reportPlayback();
  }, [remember, reportPlayback]);

  const playIndex = useCallback(async (index: number) => {
    const current = modelRef.current;
    if (!current || !workspacePlaybackAllowed(current.endsAt, Date.now())) return;
    setBarDismissed(false);
    seekRef.current = 0;
    evidenceRef.current.reset(0);
    await ctlRef.current?.playIndex(index);
    remember({ index, positionSec: 0 }, true);
    reportPlayback();
  }, [remember, reportPlayback]);

  const setVolume = useCallback((value: number) => {
    remember({ volume: value }, false);
  }, [remember]);

  const setQueueOrder = useCallback((indices: readonly number[]) => {
    const current = modelRef.current;
    if (!current) return;
    const seen = new Set<number>();
    const unique: number[] = [];
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= current.tracks.length || seen.has(index)) continue;
      seen.add(index);
      unique.push(index);
    }
    const prev = playOrderRef.current;
    if (prev && prev.length === unique.length && prev.every((value, index) => value === unique[index])) return;
    playOrderRef.current = unique;
    setQueueOrderState(unique);
    const ctl = ctlRef.current;
    const idle = !ctl || ctl.status === "idle";
    if (savedPlaceRef.current || !idle) return;
    const start = unique[0] ?? 0;
    if (start === playbackRef.current.index) return;
    const restored = clampWorkspacePlayback(
      { index: start, positionSec: 0, volume: playbackRef.current.volume, updatedAt: playbackRef.current.updatedAt },
      current.tracks.length,
    );
    playbackRef.current = restored;
    seekRef.current = 0;
    setPlayback(restored);
    setView((prevView) => ({ ...prevView, index: start }));
  }, []);

  const applyAtmosphereQueue = useCallback((indices: readonly number[], options: { play: boolean }) => {
    const current = modelRef.current;
    if (!current) return;
    const seen = new Set<number>();
    const unique: number[] = [];
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= current.tracks.length || seen.has(index)) continue;
      seen.add(index);
      unique.push(index);
    }
    if (unique.length === 0) return;
    playOrderRef.current = unique;
    setQueueOrderState(unique);
    const start = unique[0] ?? 0;
    savedPlaceRef.current = false;
    const ctl = ctlRef.current;
    const playingNow = options.play || ctl?.status === "playing" || ctl?.status === "loading";
    if (playingNow && ctl && (ctl.index !== start || (ctl.status !== "playing" && ctl.status !== "loading"))) {
      setBarDismissed(false);
      seekRef.current = 0;
      evidenceRef.current.reset(0);
      void ctl.playIndex(start).then(() => {
        remember({ index: start, positionSec: 0 }, true);
        reportPlayback();
      });
      playbackRef.current = clampWorkspacePlayback(
        { index: start, positionSec: 0, volume: playbackRef.current.volume, updatedAt: new Date().toISOString() },
        current.tracks.length,
      );
      setPlayback(playbackRef.current);
      setView((prevView) => ({
        ...prevView,
        index: start,
        currentTime: 0,
        duration: current.tracks[start]?.durationSeconds ?? prevView.duration,
      }));
      return;
    }
    if (playingNow && ctl) {
      remember({ index: start, positionSec: 0 }, true);
      return;
    }
    if (ctl && ctl.status !== "playing" && ctl.status !== "loading") {
      ctl.index = start;
      const audio = audioRef.current;
      if (audio && audio.src) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
    }
    const restored = clampWorkspacePlayback(
      { index: start, positionSec: 0, volume: playbackRef.current.volume, updatedAt: new Date().toISOString() },
      current.tracks.length,
    );
    playbackRef.current = restored;
    seekRef.current = 0;
    setPlayback(restored);
    setView((prevView) => ({
      ...prevView,
      index: start,
      currentTime: 0,
      duration: current.tracks[start]?.durationSeconds ?? prevView.duration,
    }));
    remember({ index: start, positionSec: 0 }, false);
  }, [remember, reportPlayback]);

  const cancelAtmosphereRebuild = useCallback(() => {
    rebuildGen.current += 1;
  }, []);

  const rebuildFromProfile = useCallback(async (input: {
    character: GuestCoffeeCharacter;
    direction: GuestCoffeeDirection;
    daypart: CafeDaypart;
    feedback: readonly CafeQueueFeedback[];
  }): Promise<"applied" | "deferred" | "failed"> => {
    const current = modelRef.current;
    if (!current || current.tracks.length === 0) return "deferred";
    const gen = ++rebuildGen.current;
    const playingId = current.tracks[playbackRef.current.index]?.audioItemId;
    try {
      const params = new URLSearchParams({ space: current.spaceId });
      const res = await fetch(`/api/business/workspace/queue?${params.toString()}`, {
        ...JSON_POST,
        body: JSON.stringify({
          character: input.character,
          direction: input.direction,
          daypart: input.daypart,
          energyOffset: 0,
          feedback: input.feedback,
          boundaryAudioItemId: playingId,
        }),
      });
      if (rebuildGen.current !== gen) return "failed";
      if (!res.ok) return "failed";
      const json = await res.json() as { ok?: boolean; order?: unknown };
      if (rebuildGen.current !== gen) return "failed";
      if (json.ok !== true || !Array.isArray(json.order)) return "failed";
      const indices = cafeQueueIndices(current.tracks, json.order);
      if (indices.length === 0) return "failed";
      if (rebuildGen.current !== gen) return "failed";
      const ctl = ctlRef.current;
      const playingNow = Boolean(ctl && (ctl.status === "playing" || ctl.status === "loading"));
      applyAtmosphereQueue(indices, { play: playingNow });
      return "applied";
    } catch {
      return "failed";
    }
  }, [applyAtmosphereQueue]);

  const dismissBar = useCallback(async () => {
    const ctl = ctlRef.current;
    const audio = audioRef.current;
    if (ctl && (ctl.status === "playing" || ctl.status === "loading")) {
      await ctl.toggle();
    }
    audio?.pause();
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
    setBarDismissed(true);
  }, []);

  const revealNowPlaying = useCallback(() => {
    document.querySelector("[data-testid='biz-now-playing']")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const nextTime = Math.min(audio.duration, Math.max(0, ratio * audio.duration));
    audio.currentTime = nextTime;
    setView((prev) => ({ ...prev, currentTime: nextTime }));
    remember({ positionSec: nextTime }, false, true);
  }, [remember]);

  const track = model?.tracks[view.index] ?? model?.tracks[playback.index] ?? null;
  const author = track?.authorName?.trim() || "";
  const nowTitle = track ? (author ? `${track.title} – ${author}` : track.title) : null;
  const duration = view.duration > 0 ? view.duration : (track?.durationSeconds ?? 0);
  const ratio = duration > 0 ? Math.min(1, Math.max(0, view.currentTime / duration)) : 0;
  const playing = view.status === "playing" || view.status === "loading";

  const api: CabinetPlayerApi = {
    adopt,
    release,
    view,
    toggle,
    next,
    playIndex,
    setVolume,
    seek,
    volume: playback.volume,
    saveNote,
    queueOrder,
    setQueueOrder,
    applyAtmosphereQueue,
    rebuildFromProfile,
    cancelAtmosphereRebuild,
  };

  useLayoutEffect(() => {
    const bar = barRef.current;
    const shell = bar?.closest(".business-app-shell");
    if (!open || !bar || !(shell instanceof HTMLElement)) return;
    const apply = () => {
      shell.style.setProperty("--biz-cabinet-player-height", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--biz-cabinet-player-height");
    };
  }, [open, barDismissed, nowTitle, view.message, saveNote, playing, view.status]);

  const coverSrc = track ? cabinetAlbumCoverUrl({ coverUrl: track.coverUrl }) : null;

  return (
    <CabinetContext.Provider value={api}>
      {children}
      {open && !barDismissed ? (
        <section ref={barRef} className="business-cabinet-player" aria-label="Плеер кабинета" data-testid="biz-workspace-player">
          <div
            className="business-cabinet-player__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={Math.max(1, Math.round(duration))}
            aria-valuenow={Math.round(view.currentTime)}
            aria-label="Прогресс трека"
            data-testid="biz-workspace-progress"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width <= 0) return;
              seek((event.clientX - rect.left) / rect.width);
            }}
          >
            <span style={{ width: `${ratio * 100}%` }} />
          </div>
          <button type="button" className="business-cabinet-player__open business-app-focus-ring" data-testid="biz-workspace-player-open" onClick={revealNowPlaying}>
            <span className="business-cabinet-player__cover" data-has-image={coverSrc && failedCover !== coverSrc ? "true" : "false"}>
              {coverSrc && failedCover !== coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- public catalog cover, same as the queue rows
                <img src={coverSrc} alt="" width={40} height={40} onError={() => setFailedCover(coverSrc)} />
              ) : null}
            </span>
            <span className="business-cabinet-player__title">{nowTitle ?? "Музыка"}</span>
          </button>
          <p className="business-cabinet-player__time" data-testid="biz-workspace-time">
            {formatPlaybackClock(view.currentTime)} / {formatPlaybackClock(duration)}
          </p>
          <BusinessPlayerControls
            testIdPrefix="biz-workspace"
            playing={view.status === "playing"}
            loading={view.status === "loading"}
            nowTitle={null}
            onToggle={() => void toggle()}
            onNext={() => void next()}
            volume={playback.volume}
            onVolume={setVolume}
            appearance="round"
            size="compact"
          />
          <button
            type="button"
            className="business-cabinet-player__close business-app-focus-ring"
            aria-label="Закрыть плеер"
            data-testid="biz-workspace-player-close"
            onClick={() => void dismissBar()}
          >
            <span aria-hidden="true">×</span>
          </button>
          {view.message ? (
            <p className="business-app-alert business-cabinet-player__note" data-tone="warn" role="alert" data-testid="biz-workspace-player-message">
              {musicPlayerMessage(view.message)}
            </p>
          ) : null}
          {saveNote ? <p className="text-sm text-[var(--biz-text-muted)] business-cabinet-player__note" data-testid="biz-workspace-save-note">{saveNote}</p> : null}
        </section>
      ) : null}
      {open ? <audio ref={audioRef} preload="none" playsInline data-testid="biz-workspace-audio" /> : null}
    </CabinetContext.Provider>
  );
}
