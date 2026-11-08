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

import { coffeeStorage } from "@/lib/business-app/shared-coffee-storage";

import BusinessCabinetMiniBar from "@/components/business-app/workspace/BusinessCabinetMiniBar";
import { cabinetAlbumCoverUrl } from "@/lib/business-app/album-cover";
import { postPointReport } from "@/lib/business-app/cabinet-player-client";
import { POINT_RESUME_SETTLE_MS, runPointCommands, waitWhileLoading } from "@/lib/business-app/point-commands";
import { POINT_SOUND_CHANGED_EVENT, createPointSoundApplier, pointKeepCurrentOrder, pointMusicAllowed, pointSoundUpdate, type PointSoundUpdate } from "@/lib/business-app/point-sound";
import { formatPlaybackClock } from "@/lib/business-app/playback-clock";
import { FadingAudio } from "@/lib/business-app/player-fade";
import { startWakeTicker } from "@/lib/business-app/wake-ticker";
import { SpaOnlinePlayer as Controller, type OnlineStatus } from "@/lib/business-app/spa-online-player";
import { deriveSpaPlaybackState, sendSpaLiveReport, SpaLiveEvidence } from "@/lib/business-app/spa-live-report";
import { atmosphereQueuePlan, peekAtmosphereRestart, takeAtmosphereRestart } from "@/lib/business-app/cafe-queue/atmosphere-restart";
import { cafeQueueIndices, cafeQueueNextIndex, cafeQueuePreviousIndex } from "@/lib/business-app/cafe-queue/order";
import type { CafeDaypart, CafeQueueFeedback } from "@/lib/business-app/cafe-queue/prefs";
import type { GuestCoffeeCharacter, GuestCoffeeDirection } from "@/lib/business-app/guest-coffee/catalog";
import { BUSINESS_SOUND_PROFILE_STORAGE_KEY, parseBusinessSoundProfile } from "@/lib/business-app/sound-profile";
import {
  clampWorkspacePlayback,
  newerPlayback,
  playbackStorageKey,
  type WorkspacePlayback,
} from "@/lib/business-workspace/playback";
import { createAccessDeadline, fetchWorkspaceAccess, workspaceAudioDeadline, workspaceControllerKey } from "@/lib/business-workspace/access-deadline";
import { workspaceAtmosphereStartIndex } from "@/lib/business-workspace/shelves";
import {
  workspaceItems,
  workspacePlaybackAllowed,
  workspacePlaybackDeadline,
  workspacePlayerOpen,
  type WorkspacePageModel,
} from "@/lib/business-workspace/model";

type View = {
  status: OnlineStatus;
  message: string | null;
  /** Autoplay refused after a reload/reconnect: show one green «Включить музыку» button. */
  needsGesture: boolean;
  index: number;
  currentTime: number;
  duration: number;
};

type CabinetPlayerApi = {
  accessModel: WorkspacePageModel | null;
  pointDevice: boolean;
  canChangeMusic: boolean;
  adopt: (model: WorkspacePageModel) => void;
  release: () => void;
  view: View;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  playIndex: (index: number) => Promise<void>;
  setVolume: (value: number) => void;
  /** Scrub the current track. `ratio` is 0–1 of the known duration. */
  seek: (ratio: number) => void;
  volume: number;
  saveNote: string | null;
  /** Catalog indices in play order. Null until the cafe queue answers: catalog order. */
  queueOrder: readonly number[] | null;
  setQueueOrder: (indices: readonly number[]) => void;
  /** Replace upcoming tracks; move the cursor only when the player is inactive. */
  applyAtmosphereQueue: (indices: readonly number[]) => void;
  /**
   * Rebuild the live queue for the stored sound profile.
   * Applied: the upcoming order was replaced; a playing/loading track stays untouched.
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

/** Track URL request timeout: a hung request falls back to the controller's backoff retry. */
const SIGN_TIMEOUT_MS = 15_000;
/** The one green button shown when the browser refused autoplay (no tap yet). */
export const ENABLE_MUSIC_LABEL = "Включить музыку";

const JSON_POST = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "same-origin" as const,
  cache: "no-store" as const,
};

function readLocal(spaceId: string, trackCount: number, locationId?: string): WorkspacePlayback | null {
  try {
    const raw = window.localStorage.getItem(playbackStorageKey(spaceId, locationId));
    if (!raw) return null;
    return clampWorkspacePlayback(JSON.parse(raw) as Partial<WorkspacePlayback>, trackCount);
  } catch {
    return null;
  }
}

function writeLocal(spaceId: string, playback: WorkspacePlayback, locationId?: string): void {
  try {
    window.localStorage.setItem(playbackStorageKey(spaceId, locationId), JSON.stringify(playback));
  } catch {
    /* private mode */
  }
}

export function BusinessCabinetPlayerProvider({
  initialModel = null,
  pointReports = false,
  children,
}: {
  initialModel?: WorkspacePageModel | null;
  /** Only the paired venue device writes heartbeat and now playing. */
  pointReports?: boolean;
  children: ReactNode;
}) {
  const usageSession = useRef<string | null>(null);
  const usageSeq = useRef(0);
  const [model, setModel] = useState<WorkspacePageModel | null>(initialModel);
  const modelRef = useRef(model);
  const accessRef = useRef<ReturnType<typeof createAccessDeadline> | null>(null);
  useLayoutEffect(() => {
    modelRef.current = model;
  }, [model]);
  const open = Boolean(model && workspacePlayerOpen(model) && model.tracks.length > 0);
  const initialPlayback = clampWorkspacePlayback(model?.playback ?? null, model?.tracks.length ?? 0);
  const playbackRef = useRef<WorkspacePlayback>(initialPlayback);
  const seekRef = useRef(initialPlayback.positionSec);
  const lastPostRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctlRef = useRef<Controller | null>(null);
  /** Fade-in on play, fade-out on pause (player-fade.ts). Owns `audio.volume`. */
  const fadeRef = useRef<FadingAudio | null>(null);
  const toggleRef = useRef<() => Promise<void>>(async () => {});
  const nextRef = useRef<(signal?: AbortSignal) => Promise<void>>(async () => {});
  const refreshPointSoundRef = useRef<() => void>(() => {});
  const [pointCanEdit, setPointCanEdit] = useState(false);
  const soundInstallRef = useRef<Promise<unknown> | null>(null);
  const evidenceRef = useRef(new SpaLiveEvidence());
  const [playback, setPlayback] = useState(initialPlayback);
  const [view, setView] = useState<View>({
    status: "idle",
    message: null,
    needsGesture: false,
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
    const current = modelRef.current;
    // Navigation may arrive after a newer status response. Reject conflicting
    // access here (including catalog-less denial) until a fresh status check confirms it.
    // Extensions still supersede older in-flight status decisions synchronously.
    const access = current?.spaceId === next.spaceId ? accessRef.current : null;
    if (access && !access.update(next)) return;
    if (next.status === "unavailable") return;
    if (!workspacePlayerOpen(next)) {
      void ctlRef.current?.applyManifest(null);
      (fadeRef.current ?? audioRef.current)?.pause();
      modelRef.current = next;
      setModel(next);
      return;
    }
    if (next.tracks.length === 0) {
      if (!current || current.spaceId !== next.spaceId) return;
      next = { ...next, tracks: current.tracks, playback: current.playback };
    }
    const key = workspaceControllerKey(next);
    modelRef.current = next;
    setModel(next);
    const restart = peekAtmosphereRestart();
    if (restart) savedPlaceRef.current = false;
    if (restoredKey.current === key && !restart) return;
    restoredKey.current = key;
    if (restart) return;
    playOrderRef.current = null;
    setQueueOrderState(null);
    const count = next.tracks.length;
    const local = readLocal(next.spaceId, count, next.playbackScope);
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
      stored = coffeeStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY);
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
    (fadeRef.current ?? audioRef.current)?.pause();
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
    writeLocal(current.spaceId, next, current.playbackScope);
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

  const canBeat = pointReports;
  const reportPlayback = useCallback(() => {
    if (!canBeat) return;
    const audio = audioRef.current;
    const ctl = ctlRef.current;
    if (!audio || !ctl) return;
    // During a skip fade-out the element still sounds the previous track: report that one.
    const audible = ctl.audibleItemId;
    const state = deriveSpaPlaybackState(ctl.status, { paused: audio.paused, ended: audio.ended }, Boolean(audible), ctl.recovering);
    const report = evidenceRef.current.report(state, audible, Date.now());
    sendSpaLiveReport(
      (live) => {
        if (!usageSession.current) usageSession.current = crypto.randomUUID();
        return postPointReport({ kind: "playback", report: live, sample: live.playingConfirmed && audioRef.current ? {
          eventId: crypto.randomUUID(), sessionId: usageSession.current, seq: ++usageSeq.current,
          positionMs: Math.floor(audioRef.current.currentTime * 1000),
        } : null });
      },
      report,
    );
  }, [canBeat]);
  useLayoutEffect(() => {
    reportRef.current = reportPlayback;
  }, [reportPlayback]);

  useEffect(() => {
    if (!canBeat) return;
    const beat = () => {
      void postPointReport({ kind: "heartbeat" });
    };
    beat();
    const timer = window.setInterval(beat, 30_000);
    return () => window.clearInterval(timer);
  }, [canBeat]);

  const catalogKey = model && open ? workspaceControllerKey(model) : "";

  useEffect(() => {
    const audio = audioRef.current;
    const current = modelRef.current;
    if (!audio || !open || !current || !catalogKey) return;
    const fader = new FadingAudio(audio);
    fader.setVolume(playbackRef.current.volume);
    fadeRef.current = fader;
    const ctl = new Controller(
      {
        audio: fader,
        sign: async (audioItemId) => {
          // A hung request on a flaky network must not freeze recovery: give up after 15 s
          // and let the controller retry with backoff.
          const abort = new AbortController();
          const timeout = window.setTimeout(() => abort.abort(), SIGN_TIMEOUT_MS);
          try {
            const params = new URLSearchParams({ space: modelRef.current?.spaceId ?? "cafe" });
            const res = await fetch(`/api/business/workspace/track-url?${params.toString()}`, {
              ...JSON_POST,
              body: JSON.stringify({ audioItemId }),
              signal: abort.signal,
            });
            const json = (await res.json()) as { ok?: boolean; data?: { url?: string }; reason?: string };
            if (json.ok === true && typeof json.data?.url === "string") return { ok: true, data: { url: json.data.url } };
            return { ok: false, reason: json.reason || "network" };
          } catch {
            return { ok: false, reason: "network" };
          } finally {
            window.clearTimeout(timeout);
          }
        },
        nextIndex: (currentIndex, length) => cafeQueueNextIndex(playOrderRef.current, currentIndex, length),
        previousIndex: (currentIndex, length) => cafeQueuePreviousIndex(playOrderRef.current, currentIndex, length),
        onChange: () => {
          const current = ctlRef.current;
          if (!current) return;
          // The «Включить музыку» tap must be reachable: never keep it inside a closed bar.
          if (current.needsGesture) setBarDismissed(false);
          setView((prev) => ({
            ...prev,
            status: current.status,
            message: current.message,
            needsGesture: current.needsGesture,
            index: current.index < 0 ? prev.index : current.index,
          }));
        },
      },
      workspaceItems(current.tracks, workspaceAudioDeadline(current)),
    );
    ctlRef.current = ctl;
    const onTime = () => {
      // Hidden hall tab: timers may wake once a minute; media events keep the fade smooth.
      fader.nudge();
      // Skip fade-out: these updates belong to the previous track, not the chosen one.
      if (ctl.fadingOutPrevious) return;
      evidenceRef.current.onTimeUpdate(audio.currentTime, Date.now(), audio.paused);
      setView((prev) => ({
        ...prev,
        currentTime: audio.currentTime,
        duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : prev.duration,
      }));
      ctl.onProgress(audio.currentTime, audio.duration);
      if (audio.paused) return;
      remember({ index: ctl.index < 0 ? playbackRef.current.index : ctl.index, positionSec: audio.currentTime }, false, true);
    };
    const sendReport = () => reportRef.current();
    const onPlaying = () => {
      fader.nudge();
      evidenceRef.current.onPlaying(audio.currentTime);
      sendReport();
    };
    const onEnded = () => void ctl.onEnded();
    const onError = () => void ctl.onError();
    // Network recovery (P0-3): a stall that does not move on, or the connection coming
    // back, is handled by the controller (backoff retries, resume at the position).
    const onWaiting = () => ctl.onWaiting();
    const onOnline = () => void ctl.onOnline();
    const onVisible = () => { if (document.visibilityState === "visible") void ctl.onOnline(); };
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("stalled", onWaiting);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", sendReport);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    const reportTimer = window.setInterval(sendReport, 15_000);
    return () => {
      window.clearInterval(reportTimer);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onWaiting);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", sendReport);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      ctl.dispose();
      ctlRef.current = null;
      fader.dispose();
      if (fadeRef.current === fader) fadeRef.current = null;
    };
  }, [catalogKey, open, remember]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !open) return;
    if (fadeRef.current) fadeRef.current.setVolume(playback.volume);
    else audio.volume = playback.volume;
  }, [open, playback.volume, catalogKey]);

  const accessSpace = open ? model?.spaceId : null;
  useEffect(() => {
    const current = modelRef.current;
    if (!accessSpace || !current) return;
    const access = createAccessDeadline(current, {
      now: Date.now,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (timer) => window.clearTimeout(timer as number),
      fetchStatus: () => fetchWorkspaceAccess(accessSpace),
      onStatus: (next) => {
        const prev = modelRef.current;
        if (!prev || prev.spaceId !== accessSpace) return;
        // Access refreshes never restore a playhead or replace the live queue/catalog.
        const updated = { ...prev, status: next.status, spaceEnabled: next.spaceEnabled,
          endsAt: next.endsAt, playbackUntil: next.playbackUntil,
          endsAtLabel: next.endsAtLabel, daysLeft: next.daysLeft };
        modelRef.current = updated;
        const ctl = ctlRef.current;
        const items = workspaceItems(updated.tracks, workspaceAudioDeadline(updated));
        if (workspacePlayerOpen(updated) && workspacePlaybackAllowed(workspacePlaybackDeadline(updated), Date.now())) {
          if (ctl?.status === "no_access") seekRef.current = 0;
          void ctl?.restoreVerifiedAccess(items);
        } else {
          void ctl?.applyManifest(items);
        }
        setModel(updated);
      },
      onExpired: () => {
        void ctlRef.current?.applyManifest(null);
        (fadeRef.current ?? audioRef.current)?.pause();
        const prev = modelRef.current;
        if (!prev || prev.spaceId !== accessSpace) return;
        const closed = { ...prev, status: "offer" as const, daysLeft: 0 };
        modelRef.current = closed;
        setModel(closed);
      },
    });
    accessRef.current = access;
    const refresh = () => { void access.refresh(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      access.dispose();
      if (accessRef.current === access) accessRef.current = null;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [accessSpace]);

  useEffect(() => {
    if (!model || !open) return;
    // applyManifest preserves playing/loading/paused state and the current audio source.
    void ctlRef.current?.applyManifest(workspaceItems(model.tracks, workspaceAudioDeadline(model)));
  }, [model, open]);

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
    if (!ctl || !current || !accessRef.current?.allowsPlayback()) return;
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
    // Mid skip the element still holds the previous track's time: the chosen one starts at 0.
    const positionSec = ctl.fadingOutPrevious ? 0 : (audioRef.current?.currentTime ?? 0);
    remember({ index: ctl.index < 0 ? index : ctl.index, positionSec }, ctl.status === "playing");
    reportPlayback();
  }, [remember, reportPlayback]);

  const next = useCallback(async (signal?: AbortSignal) => {
    const ctl = ctlRef.current;
    const current = modelRef.current;
    if (!ctl || !current || !accessRef.current?.allowsPlayback()) return;
    setBarDismissed(false);
    seekRef.current = 0;
    evidenceRef.current.reset(0);
    if (soundInstallRef.current) await soundInstallRef.current;
    if (signal?.aborted) return;
    await ctl.next();
    remember({ index: ctl.index < 0 ? 0 : ctl.index, positionSec: 0 }, true);
    reportPlayback();
  }, [remember, reportPlayback]);

  const previous = useCallback(async () => {
    const ctl = ctlRef.current;
    const current = modelRef.current;
    if (!ctl || !current || !accessRef.current?.allowsPlayback()) return;
    setBarDismissed(false);
    seekRef.current = 0;
    evidenceRef.current.reset(0);
    // Before the first play the controller index is still -1, while the card shows the saved track.
    if (ctl.index < 0) {
      const shown = playbackRef.current.index;
      if (shown >= 0 && shown < current.tracks.length) ctl.index = shown;
    }
    if (soundInstallRef.current) await soundInstallRef.current;
    await ctl.previous();
    remember({ index: ctl.index < 0 ? 0 : ctl.index, positionSec: 0 }, true);
    reportPlayback();
  }, [remember, reportPlayback]);

  useEffect(() => {
    toggleRef.current = toggle;
    nextRef.current = next;
  }, [toggle, next]);

  useEffect(() => {
    if (!canBeat) return;
    let stop = false;
    let inFlight = false;
    const commandTransport = async (signal: AbortSignal, apply: () => Promise<void>) => {
      const ctl = ctlRef.current;
      const cancel = () => {
        if (ctl?.status === "loading") void ctl.toggle();
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        if (!signal.aborted) await apply();
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    };
    const tick = async () => {
      if (stop || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/business/point", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ action: "commands" }),
          signal: AbortSignal.timeout(5_000),
        });
        const json = (await res.json()) as { ok?: boolean; commands?: { id?: unknown; type?: unknown }[] };
        if (!json.ok || !Array.isArray(json.commands)) return;
        if (json.commands.length > 0) refreshPointSoundRef.current();
        await runPointCommands(json.commands, {
          ready: () => !!ctlRef.current && !!modelRef.current?.tracks.length
            && accessRef.current?.allowsPlayback() === true,
          status: () => ctlRef.current?.status ?? "idle",
          toggle: (signal) => commandTransport(signal, () => toggleRef.current()),
          next: (signal) => commandTransport(signal, () => nextRef.current(signal)),
          applied: async (type) => {
            // Soft pause resolves before the fade has actually silenced the element.
            if (type === "pause" && fadeRef.current?.fadingOut) await fadeRef.current.fadeOut();
            // Resume / next while a track is still loading (sign, reconnect): wait for it here
            // instead of failing and waiting out the 30 s lease.
            if (type !== "pause") await waitWhileLoading(() => ctlRef.current?.status ?? "idle", POINT_RESUME_SETTLE_MS);
            const status = ctlRef.current?.status;
            const audio = audioRef.current;
            return !!audio && (type === "pause"
              ? (status === "paused" || status === "idle") && audio.paused
              : status === "playing" && !audio.paused);
          },
          ack: async (command) => {
            const ack = await fetch("/api/business/point", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              cache: "no-store",
              signal: AbortSignal.timeout(5_000),
              body: JSON.stringify({ action: "ack", id: command.id, claimId: command.claim_id }),
            });
            if (!ack.ok || (await ack.json()).ok !== true) throw new Error("point_command_ack_failed");
          },
          stopped: () => stop,
        });
      } catch {
        /* No ack: the command becomes reclaimable after its lease, until expires_at. */
      } finally {
        inFlight = false;
      }
    };
    void tick();
    // Worker-backed: a paused hall tab in the background still polls every 5 s.
    const stopTicker = startWakeTicker(() => void tick(), 5_000);
    const wake = () => { if (document.visibilityState === "visible") void tick(); };
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stop = true;
      stopTicker();
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [canBeat]);

  const playIndex = useCallback(async (index: number) => {
    const current = modelRef.current;
    if (!current || !accessRef.current?.allowsPlayback()) return;
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
    const ctl = ctlRef.current;
    const plan = atmosphereQueuePlan({
      indices: unique,
      currentIndex: ctl && ctl.index >= 0 ? ctl.index : playbackRef.current.index,
      status: ctl?.status ?? "idle",
    });
    const order = plan.order;
    const prev = playOrderRef.current;
    if (prev && prev.length === order.length && prev.every((value, index) => value === order[index])) return;
    playOrderRef.current = order;
    setQueueOrderState(order);
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

  const applyAtmosphereQueue = useCallback((indices: readonly number[]) => {
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
    const ctl = ctlRef.current;
    const plan = atmosphereQueuePlan({
      indices: unique,
      currentIndex: ctl && ctl.index >= 0 ? ctl.index : playbackRef.current.index,
      status: ctl?.status ?? "idle",
    });
    playOrderRef.current = plan.order;
    setQueueOrderState(plan.order);
    takeAtmosphereRestart();
    if (plan.keepCurrent) return;
    const start = plan.index;
    savedPlaceRef.current = false;
    if (ctl && ctl.status !== "playing" && ctl.status !== "loading") {
      ctl.index = start;
      const audio = audioRef.current;
      if (audio && audio.src) {
        (fadeRef.current ?? audio).pause();
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
  }, [remember]);

  const cancelAtmosphereRebuild = useCallback(() => {
    rebuildGen.current += 1;
  }, []);

  const rebuildFromProfile = useCallback(async (input: {
    character: GuestCoffeeCharacter;
    direction: GuestCoffeeDirection;
    daypart: CafeDaypart;
    feedback: readonly CafeQueueFeedback[];
    energyOffset?: number;
    /** Leave the current track playing. The new order is used on the next advance. */
    keepCurrent?: boolean;
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
          energyOffset: input.energyOffset ?? 0,
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
      if (input.keepCurrent) {
        const order = pointKeepCurrentOrder(indices, ctl && ctl.index >= 0 ? ctl.index : playbackRef.current.index);
        playOrderRef.current = order;
        setQueueOrderState(order);
        return "applied";
      }
      applyAtmosphereQueue(indices);
      return "applied";
    } catch {
      return "failed";
    }
  }, [applyAtmosphereQueue]);

  useEffect(() => {
    if (!canBeat) return;
    const applySound = createPointSoundApplier();
    let latest: PointSoundUpdate | null = null;
    let stop = false;
    let inFlight = false;
    let refreshPending = false;
    const take = (sound: PointSoundUpdate) => {
      if (soundInstallRef.current) return;
      const run = applySound(sound, (daypart) => rebuildFromProfile({
        character: sound.character,
        direction: sound.direction,
        daypart,
        feedback: [],
        energyOffset: sound.energyOffset,
        keepCurrent: true,
      })).finally(() => {
        if (soundInstallRef.current === run) soundInstallRef.current = null;
      });
      soundInstallRef.current = run;
    };
    const tick = async () => {
      if (stop) return;
      if (inFlight) {
        refreshPending = true;
        return;
      }
      inFlight = true;
      try {
        const res = await fetch("/api/business/point", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ action: "sound" }),
        });
        const json: unknown = await res.json();
        if (stop) return;
        setPointCanEdit(pointMusicAllowed(json));
        latest = pointSoundUpdate(json);
      } catch {
        /* Keep the last settings for clock transitions during a network failure. */
      } finally {
        inFlight = false;
        if (!stop && latest) take(latest);
        if (!stop && refreshPending) {
          refreshPending = false;
          void tick();
        }
      }
    };
    const refresh = () => { void tick(); };
    refreshPointSoundRef.current = refresh;
    window.addEventListener(POINT_SOUND_CHANGED_EVENT, refresh);
    void tick();
    const timer = window.setInterval(() => void tick(), 5_000);
    const clockTimer = window.setInterval(() => {
      if (!stop && latest && !soundInstallRef.current) take(latest);
    }, 5_000);
    return () => {
      stop = true;
      refreshPointSoundRef.current = () => {};
      window.removeEventListener(POINT_SOUND_CHANGED_EVENT, refresh);
      window.clearInterval(timer);
      window.clearInterval(clockTimer);
    };
  }, [canBeat, rebuildFromProfile]);

  const dismissBar = useCallback(async () => {
    const ctl = ctlRef.current;
    const audio = audioRef.current;
    const fader = fadeRef.current;
    setBarDismissed(true);
    if (ctl && (ctl.status === "playing" || ctl.status === "loading")) {
      await ctl.toggle();
    }
    // Let the fade-out finish; a play pressed meanwhile keeps the music.
    if (fader && fader.fadingOut && !(await fader.fadeOut())) return;
    if (ctl && (ctl.status === "playing" || ctl.status === "loading")) return;
    if (fader) fader.pause();
    else audio?.pause();
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
  }, []);

  const revealNowPlaying = useCallback(() => {
    document.querySelector("[data-testid='biz-now-playing']")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const seek = useCallback((ratio: number) => {
    // Seek is local. The owner accepts a stale-permission window of ~5 s within
    // the current track: this does not change the music. Commands refresh it sooner.
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    // The previous track is fading out after a skip: the bar already shows the chosen one.
    if (ctlRef.current?.fadingOutPrevious) return;
    const nextTime = Math.min(audio.duration, Math.max(0, ratio * audio.duration));
    audio.currentTime = nextTime;
    setView((prev) => ({ ...prev, currentTime: nextTime }));
    remember({ positionSec: nextTime }, false, true);
  }, [remember]);

  const track = model?.tracks[view.index] ?? model?.tracks[playback.index] ?? null;
  const author = track?.authorName?.trim() || "";
  const nowTitle = track ? (author ? `${track.title} – ${author}` : track.title) : null;
  const duration = view.duration > 0 ? view.duration : (track?.durationSeconds ?? 0);
  const playing = view.status === "playing" || view.status === "loading";

  const authorizeMusicChange = async (): Promise<boolean> => {
    if (!pointReports) return true;
    try {
      const res = await fetch("/api/business/point", {
        ...JSON_POST,
        body: JSON.stringify({ action: "music-change" }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || json.ok !== true) {
        setPointCanEdit(false);
        if (json.error) setSaveNote(json.error);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };
  const deviceNext = async () => { if (await authorizeMusicChange()) await next(); };
  const devicePrevious = async () => { if (await authorizeMusicChange()) await previous(); };
  const devicePlayIndex = async (index: number) => { if (await authorizeMusicChange()) await playIndex(index); };

  const api: CabinetPlayerApi = {
    accessModel: model,
    pointDevice: pointReports,
    canChangeMusic: !pointReports || pointCanEdit,
    adopt,
    release,
    view,
    toggle,
    next: deviceNext,
    previous: devicePrevious,
    playIndex: devicePlayIndex,
    setVolume,
    seek: pointReports && !pointCanEdit ? () => {} : seek,
    volume: playback.volume,
    saveNote,
    queueOrder,
    setQueueOrder: pointReports ? () => {} : setQueueOrder,
    applyAtmosphereQueue: pointReports ? () => {} : applyAtmosphereQueue,
    rebuildFromProfile: pointReports ? async () => "deferred" : rebuildFromProfile,
    cancelAtmosphereRebuild,
  };

  const coverSrc = track ? cabinetAlbumCoverUrl({ coverUrl: track.coverUrl }) : null;

  return (
    <CabinetContext.Provider value={api}>
      {children}
      {open && !barDismissed ? (
        <BusinessCabinetMiniBar
          title={nowTitle ?? "Музыка"}
          coverSrc={coverSrc && failedCover !== coverSrc ? coverSrc : null}
          onCoverError={() => {
            if (coverSrc) setFailedCover(coverSrc);
          }}
          playing={playing}
          loading={view.status === "loading"}
          onToggle={() => void toggle()}
          onNext={() => void deviceNext()}
          nextDisabled={pointReports && !pointCanEdit}
          onClose={() => void dismissBar()}
          onOpen={revealNowPlaying}
          onSeek={pointReports && !pointCanEdit ? undefined : seek}
          currentTime={view.currentTime}
          duration={duration}
          timeLabel={`${formatPlaybackClock(view.currentTime)} / ${formatPlaybackClock(duration)}`}
          volume={playback.volume}
          onVolume={setVolume}
          message={view.message ? musicPlayerMessage(view.message) : null}
          ctaLabel={view.needsGesture ? ENABLE_MUSIC_LABEL : null}
          onCta={() => void toggle()}
          ctaTestId="biz-workspace-enable-music"
          messageTestId="biz-workspace-player-message"
          note={saveNote}
          noteTestId="biz-workspace-save-note"
          testId="biz-workspace-player"
          progressTestId="biz-workspace-progress"
          openTestId="biz-workspace-player-open"
          closeTestId="biz-workspace-player-close"
          controlsPrefix="biz-workspace"
          ariaLabel="Плеер кабинета"
        />
      ) : null}
      {open ? <audio ref={audioRef} preload="auto" playsInline data-testid="biz-workspace-audio" /> : null}
    </CabinetContext.Provider>
  );
}
