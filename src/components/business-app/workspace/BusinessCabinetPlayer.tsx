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
import { postPointEvents, postPointReport, postPointUsage } from "@/lib/business-app/cabinet-player-client";
import { HALL_BUFFER_IOS_START_DELAY_MS, HALL_BUFFER_IOS_TRACKS, HallOfflineBuffer, hallBufferPlan } from "@/lib/business-app/hall-offline-buffer";
import {
  HallDeviceJournal,
  clearHallPageAlive,
  hallNavigationType,
  markHallPageAlive,
  type HallJournalData,
  type HallJournalKind,
} from "@/lib/business-app/hall-device-journal";
import { HallLastBreathWriter, hallPrevPageReport, readHallLastBreath } from "@/lib/business-app/hall-last-breath";
import { countHallBufferEntries, createHallBufferStore, purgeHallBufferStorage, readHallBufferOwner, writeHallBufferOwner } from "@/lib/business-app/hall-offline-buffer-store";
import { HallReportQueue } from "@/lib/business-app/hall-report-queue";
import {
  hallBuildMismatch,
  hallIntentOf,
  hallMusicSilent,
  readReloadedBuildId,
  rememberReloadedBuildId,
  resolveHallClientBuildId,
  shouldReloadForNewBuild,
} from "@/lib/business-app/hall-build-reload";
import { pointCommandApplied, runPointCommands } from "@/lib/business-app/point-commands";
import { POINT_SOUND_CHANGED_EVENT, createPointSoundApplier, pointKeepCurrentOrder, pointMusicAllowed, pointSoundUpdate, type PointSoundUpdate } from "@/lib/business-app/point-sound";
import { formatPlaybackClock } from "@/lib/business-app/playback-clock";
import { FadingAudio, isAppleTouchDevice } from "@/lib/business-app/player-fade";
import {
  HALL_AUTO_RESUME_MAX_AGE_MS,
  HALL_TOUCH_RESUME_SKIP_SELECTOR,
  HallPlayingMarkerWriter,
  clearHallPlayingMarker,
  hallMeantToPlay,
  readHallPlayingMarker,
  shouldAutoResumeHall,
} from "@/lib/business-app/hall-auto-resume";
import { prepareLoopAudio } from "@/lib/business-app/hall-loop-audio";
import { HallWakeIntentTracker, HallWakeLock, type WakeLockNavigator } from "@/lib/business-app/hall-wake-lock";
import { lockedAppleScreen, playerSessionState, runSessionAction, syncPlayerMediaSession, type PlayerSessionState, type SessionAction } from "@/lib/business-app/hall-media-session";
import { startWakeTicker } from "@/lib/business-app/wake-ticker";
import { HALL_MIRROR_PENDING_MS, HALL_MIRROR_POLL_MS, hallMirrorView, hallShownView, hallUpcomingSnapshot, parseHallNowPlaying, type HallNowPlaying, type HallPending } from "@/lib/business-app/hall-mirror";
import type { PointCommandType } from "@/lib/business-app/point-commands";
import { SpaOnlinePlayer as Controller, type OnlineSignResult, type OnlineStatus } from "@/lib/business-app/spa-online-player";
import { deriveSpaPlaybackState, sendSpaLiveReport, SpaLiveEvidence } from "@/lib/business-app/spa-live-report";
import { atmosphereQueuePlan, peekAtmosphereRestart, takeAtmosphereRestart } from "@/lib/business-app/cafe-queue/atmosphere-restart";
import {
  CAFE_QUEUE_RECENT_RING,
  createQueueTopUpGuard,
  rememberPlayedId,
  shouldTopUpQueue,
  spliceTopUpOrder,
  uniqueAheadCount,
  queueTopUpOwnsPlayback,
} from "@/lib/business-app/cafe-queue/auto-topup";
import { cafeQueueIndices, cafeQueueNextIndex, cafeQueuePreviousIndex } from "@/lib/business-app/cafe-queue/order";
import {
  CAFE_QUEUE_FEEDBACK_KEY,
  CAFE_QUEUE_PREFS_KEY,
  cafeDaypartHoursKey,
  effectiveCafeDaypartAt,
  parseCafeDaypartHours,
  parseCafeQueueFeedback,
  parseCafeQueuePrefs,
  type CafeDaypart,
  type CafeQueueFeedback,
} from "@/lib/business-app/cafe-queue/prefs";
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
  /**
   * Owner screens while a live hall device plays (hall-mirror.ts): `view`, `queueOrder` and
   * the mini bar show the hall; play / pause / next send the hall commands; nothing plays here.
   */
  hallMirror: boolean;
  /** Next is offered: the hall command in the mirror, otherwise the music-change right. */
  canNext: boolean;
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
  queueAheadCount: number | null;
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
  /**
   * Hall device only (Sergey 09.11.2026): «Больше / Меньше такой музыки» from staff. Checks the
   * owner's switch on the server (music-change), then rebuilds the hall's own queue from the
   * venue sound with these votes; the playing track stays. Later sound and daypart rebuilds on
   * the hall keep the votes. `fallback` is used before the first venue sound answer.
   */
  steerHall: (
    feedback: readonly CafeQueueFeedback[],
    fallback: { character: GuestCoffeeCharacter; direction: GuestCoffeeDirection; daypart: CafeDaypart } | null,
  ) => Promise<"applied" | "failed">;
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

/** Short-lived signed URL of one track (server re-checks access). Shared by the player and the hall buffer. */
async function signWorkspaceTrack(spaceId: string, audioItemId: string): Promise<OnlineSignResult> {
  // A hung request on a flaky network must not freeze recovery: give up after 15 s
  // and let the controller retry with backoff.
  const abort = new AbortController();
  const timeout = window.setTimeout(() => abort.abort(), SIGN_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ space: spaceId });
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
}

/** One buffer download may take this long before it is abandoned (slow line: retried later). */
const BUFFER_FETCH_TIMEOUT_MS = 180_000;
/** t1390u: hall iPhone – the next link is signed after this much of a track (not at the boundary). */
const HALL_IOS_PRESIGN_DELAY_SEC = 30;
/** t1390u: «position does not move» check of the hall player. */
const HALL_WATCHDOG_TICK_MS = 2_000;
/** t1390u: periodic journal snapshot (uptime, tracks since load, buffer, storage). */
const HALL_JOURNAL_SNAPSHOT_MS = 5 * 60_000;

/**
 * t1390u: the buffer download as a raw response – its body streams into Cache Storage
 * (hall-offline-buffer-store.ts putResponse) and never becomes a Blob in the page. The timeout
 * also covers the body: it aborts a download still running after BUFFER_FETCH_TIMEOUT_MS.
 */
async function fetchTrackResponse(url: string, signal: AbortSignal): Promise<Response> {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), BUFFER_FETCH_TIMEOUT_MS);
  const stop = () => {
    window.clearTimeout(timer);
    timeout.abort();
  };
  signal.addEventListener("abort", stop, { once: true });
  // Straight to the storage URL: the service worker never handles audio (public/sw.js).
  try {
    return await fetch(url, { signal: timeout.signal, credentials: "omit", cache: "no-store" });
  } catch (error) {
    // No body to stream: release the timer and the listener now (otherwise they end with it).
    window.clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    throw error;
  }
}

async function fetchTrackBlob(url: string, signal: AbortSignal): Promise<Blob> {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), BUFFER_FETCH_TIMEOUT_MS);
  const stop = () => timeout.abort();
  signal.addEventListener("abort", stop, { once: true });
  try {
    // Straight to the storage URL: the service worker never handles audio (public/sw.js).
    const res = await fetch(url, { signal: timeout.signal, credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error(`buffer_fetch_${res.status}`);
    return await res.blob();
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}


/** The hall reports its buffered count when it changes, else at most this often. */

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

function hallLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** t1365u: the auto-resume waits this long at most for the controller / access after a load. */
const HALL_AUTO_RESUME_READY_MS = 20_000;
const HALL_AUTO_RESUME_POLL_MS = 250;

function hallKey(hall: HallNowPlaying): string {
  return `${hall.state}:${hall.audioItemId ?? ""}`;
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
  /** Hall device: staff votes, kept for every later rebuild of the hall queue. */
  const hallFeedbackRef = useRef<readonly CafeQueueFeedback[]>([]);
  /** Hall device: the venue sound of the last rebuild (what a staff vote rebuilds from). */
  const hallSoundRef = useRef<{ character: GuestCoffeeCharacter; direction: GuestCoffeeDirection; daypart: CafeDaypart; energyOffset: number } | null>(null);
  /** Recently played audio ids (device ring) – pushed to the back on auto top-up. */
  const recentPlayedRef = useRef<string[]>([]);
  const topUpGuardRef = useRef(createQueueTopUpGuard());
  const tryQueueTopUpRef = useRef<() => void>(() => {});
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
  const hallMirrorRef = useRef(false);
  /** t1331u: hall device only – copies of the next tracks for a short outage. */
  const bufferRef = useRef<HallOfflineBuffer | null>(null);
  const reportQueueRef = useRef<HallReportQueue | null>(null);
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
  const canBeatRef = useRef(canBeat);
  useLayoutEffect(() => {
    canBeatRef.current = canBeat;
  }, [canBeat]);
  /** t1365u: hall iPhone / iPad – start from a fresh pre-signed stream, not a blob: copy. */
  const streamFirstRef = useRef(false);
  useLayoutEffect(() => {
    streamFirstRef.current = canBeat && typeof navigator !== "undefined" && isAppleTouchDevice(navigator);
  }, [canBeat]);
  const reportPlayback = useCallback(() => {
    if (!canBeat) return;
    const audio = audioRef.current;
    const ctl = ctlRef.current;
    if (!audio || !ctl) return;
    // During a skip fade-out the element still sounds the previous track: report that one.
    const audible = ctl.audibleItemId;
    const state = deriveSpaPlaybackState(ctl.status, { paused: audio.paused, ended: audio.ended }, Boolean(audible), ctl.recovering);
    const evidence = evidenceRef.current.report(state, audible, Date.now());
    // t1390u: an autoplay refusal gets its own code (after a page reload: the browser restarted
    // the hall page and refused the automatic start). Diagnostics only – nothing is shown.
    const report = ctl.needsGesture && evidence.state !== "playing"
      ? { ...evidence, errorCode: autoResumeRefusedRef.current ? "autoplay_blocked_after_reload" : "autoplay_blocked" }
      : evidence;
    // Owner mirror (t1283u): position and the upcoming queue of what the hall really plays.
    const tracks = modelRef.current?.tracks ?? [];
    const fading = ctl.fadingOutPrevious;
    const time = fading ? 0 : audio.currentTime;
    const index = fading ? tracks.findIndex((t) => t.audioItemId === audible) : ctl.index;
    const upcoming = index >= 0 ? hallUpcomingSnapshot(tracks, playOrderRef.current, index) : { ids: [], aheadCount: 0 };
    // t1333u: buffer stays on the device only – never reported to the owner / DB.
    const nowPlaying = {
      positionMs: Number.isFinite(time) && time > 0 ? Math.min(86_400_000, Math.floor(time * 1000)) : 0,
      durationMs: !fading && Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.min(86_400_000, Math.round(audio.duration * 1000))
        : (tracks[index]?.durationSeconds ? Math.round(tracks[index].durationSeconds! * 1000) : null),
      queue: upcoming.ids,
      aheadCount: upcoming.aheadCount,
    };
    sendSpaLiveReport(
      (live) => {
        if (!usageSession.current) usageSession.current = crypto.randomUUID();
        const sample = live.playingConfirmed && audioRef.current ? {
          eventId: crypto.randomUUID(), sessionId: usageSession.current, seq: ++usageSeq.current,
          positionMs: Math.floor(audioRef.current.currentTime * 1000),
        } : null;
        // t1331u: samples recorded offline go first, in order; a new one queues behind them.
        const queue = reportQueueRef.current;
        const backlog = !!queue && queue.size > 0;
        if (sample && backlog && live.audioItemId) {
          queue.push({ ...sample, audioItemId: live.audioItemId, at: Date.now() });
        }
        return postPointReport({ kind: "playback", report: live, sample: backlog ? null : sample, nowPlaying }).then((result) => {
          if (result.ok) {
            if (queue && queue.size > 0) void queue.flush((s) => postPointUsage(s));
          } else if (result.reason === "network" && sample && !backlog && queue && live.audioItemId) {
            queue.push({ ...sample, audioItemId: live.audioItemId, at: Date.now() });
          }
          return result;
        });
      },
      report,
    );
  }, [canBeat]);
  useLayoutEffect(() => {
    reportRef.current = reportPlayback;
  }, [reportPlayback]);

  // Stale-build reload: heartbeat carries client build id; server echoes current.
  // t1346u: reload ONLY while the hall is deliberately silent (paused / idle / no access) and
  // visible. Never while music is meant to play – not even at a track boundary: after a reload
  // iPhone and Samsung block autoplay without a tap, so the hall would go quiet.
  const pendingBuildRef = useRef<string | null>(null);
  const lastTrackForReloadRef = useRef<string | null>(null);
  // Paused from the owner's phone: the owner will resume remotely, and a reloaded page could
  // not start music without a tap in the hall. Stay on this build until a local tap.
  const remotePausedRef = useRef(false);
  // An owner command is being applied / acknowledged: the controller emits "paused" before the
  // remote-pause latch is set (iPhone pauses without a fade). Never reload in that window.
  const remoteCommandBusyRef = useRef(false);
  // t1350u: hall device only – the screen stays on while the hall music is meant to play, so
  // Android battery saving cannot freeze the page between two tracks. Screen-only: it never
  // touches the audio element, the build reload above, the iPhone handoff or the fades.
  const wakeLockRef = useRef<HallWakeLock | null>(null);
  // t1390u: hall device journal (hall-device-journal.ts) – small, throttled, never shown.
  const journalRef = useRef<HallDeviceJournal | null>(null);
  const tracksSinceLoadRef = useRef(0);
  /** The start the browser refused came from the automatic resume after a page reload. */
  const autoResumeRefusedRef = useRef(false);
  const autoResumeRunningRef = useRef(false);
  /** t1390u follow-up: last track change on this page (epoch ms) and the «last breath» writer. */
  const lastTrackAtRef = useRef<number | null>(null);
  const lastBreathRef = useRef<HallLastBreathWriter | null>(null);
  const journal = useCallback((kind: HallJournalKind, data?: HallJournalData) => {
    journalRef.current?.log(kind, data);
    // Every journal event (track change, pause, refusal…) also refreshes the last breath at once:
    // a page killed right after it still leaves this state for the next page.
    lastBreathRef.current?.tick(true);
  }, []);
  /** Deliberate pause / start in flight – what the controller itself does not know. */
  const wakeIntentRef = useRef(new HallWakeIntentTracker());
  // t1365u: «this hall was playing» survives a reload of the page (hall-auto-resume.ts). Hall
  // device only; scope = space:location, like the offline buffer owner.
  const hallScopeRef = useRef<string | null>(null);
  const playingMarkerRef = useRef<HallPlayingMarkerWriter | null>(null);
  const notePlayingMarker = useCallback(() => {
    const writer = playingMarkerRef.current;
    const ctl = ctlRef.current;
    if (!writer || !ctl) return;
    writer.observe(hallScopeRef.current, ctl.status, wakeIntentRef.current.deliberatelyPaused);
  }, []);
  const syncWakeLock = useCallback(() => {
    wakeLockRef.current?.setWanted(wakeIntentRef.current.wanted(ctlRef.current, remotePausedRef.current));
  }, []);
  /** Wrap a start so the screen stays on while the play promise is pending (independent review). */
  const wakeWhileStarting = useCallback(
    (run: () => Promise<boolean | void>) => wakeIntentRef.current.whileStarting(run, syncWakeLock),
    [syncWakeLock],
  );
  useEffect(() => {
    if (!canBeat || typeof navigator === "undefined" || typeof document === "undefined") return;
    const lock = new HallWakeLock(navigator as unknown as WakeLockNavigator, document);
    wakeLockRef.current = lock;
    syncWakeLock();
    return () => {
      lock.dispose();
      if (wakeLockRef.current === lock) wakeLockRef.current = null;
    };
  }, [canBeat, syncWakeLock]);
  const trySafeBuildReload = useCallback(() => {
    const pending = pendingBuildRef.current;
    if (!pending || remotePausedRef.current || remoteCommandBusyRef.current) return;
    // t1365u: the hall was playing and nobody paused it on purpose – whatever the controller says
    // now, a reload could only silence it. Wait for a deliberate pause.
    if (playingMarkerRef.current && hallMeantToPlay(readHallPlayingMarker(hallLocalStorage()), hallScopeRef.current)) return;
    const ctl = ctlRef.current;
    const musicPaused = hallMusicSilent(
      hallIntentOf(ctl),
      audioRef.current,
    );
    const already = readReloadedBuildId(typeof window !== "undefined" ? window.sessionStorage : null);
    if (!shouldReloadForNewBuild({
      pageVisible: typeof document !== "undefined" && document.visibilityState === "visible",
      musicPaused,
      pendingServerBuild: pending,
      alreadyReloadedFor: already,
    })) return;
    rememberReloadedBuildId(
      typeof window !== "undefined" ? window.sessionStorage : null,
      pending,
    );
    pendingBuildRef.current = null;
    // localStorage playback restore (readLocal) keeps the queue position across the reload.
    window.location.reload();
  }, []);

  useEffect(() => {
    if (!canBeat) return;
    let cancelled = false;
    const beat = async () => {
      try {
        const appVersion = await resolveHallClientBuildId();
        if (cancelled) return;
        const result = await postPointReport({
          kind: "heartbeat",
          appVersion: appVersion ?? undefined,
        });
        if (cancelled || !result.ok) return;
        const serverBuildId = result.serverBuildId ?? null;
        if (hallBuildMismatch(appVersion, serverBuildId) && serverBuildId) {
          pendingBuildRef.current = serverBuildId;
          trySafeBuildReload();
        }
      } catch {
        /* best effort */
      }
    };
    void beat();
    const timer = window.setInterval(() => void beat(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") trySafeBuildReload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canBeat, trySafeBuildReload]);

  // t1390u: hall device journal – page load (navigation type, «was playing», crash suspicion),
  // visibility, a snapshot every 5 min; element / controller events are logged where they happen.
  useEffect(() => {
    if (!canBeat || typeof window === "undefined") return;
    let appVersion: string | null = null;
    void resolveHallClientBuildId().then((v) => { appVersion = v ?? null; }, () => {});
    const j = new HallDeviceJournal({
      send: (events) => postPointEvents(events, appVersion),
      context: () => {
        const ctl = ctlRef.current;
        const audio = audioRef.current;
        const buf = bufferRef.current?.stats();
        const heap = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
        return {
          st: ctl?.status ?? null,
          pos: audio && Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime) : null,
          up: Math.round((Date.now() - performance.timeOrigin) / 1000),
          n: tracksSinceLoadRef.current,
          vis: document.visibilityState === "visible" ? "v" : "h",
          wl: wakeLockRef.current?.held ?? null,
          bufN: buf?.tracks ?? null,
          bufMb: buf ? Math.round(buf.bytes / 104857.6) / 10 : null,
          bufMem: buf?.inMemory ?? null,
          heapMb: typeof heap === "number" ? Math.round(heap / 1048576) : null,
        };
      },
    });
    journalRef.current = j;
    let session: Storage | null = null;
    try { session = window.sessionStorage; } catch { session = null; }
    const pageId = `${Math.round(performance.timeOrigin)}-${Math.random().toString(36).slice(2, 8)}`;
    const { previousAlive } = markHallPageAlive(session, pageId);
    const marker = readHallPlayingMarker(hallLocalStorage());
    const markerAge = marker ? Math.round((Date.now() - marker.at) / 1000) : null;
    j.log("page_load", {
      nav: hallNavigationType(performance),
      crashSuspect: previousAlive,
      wasPlaying: markerAge !== null && markerAge <= HALL_AUTO_RESUME_MAX_AGE_MS / 1000,
      markerAgeS: markerAge,
      apple: isAppleTouchDevice(navigator),
    });
    // t1390u follow-up: how the previous hall page of this device ended («bye» false = killed),
    // from its last breath; then this page starts writing its own.
    let local: Storage | null = null;
    try { local = window.localStorage; } catch { local = null; }
    const prev = hallPrevPageReport(readHallLastBreath(local), { pageId, now: Date.now() });
    if (prev) j.log("prev_page", prev, { context: false });
    let usageMb: number | null = null;
    let cacheN: number | null = null;
    const breath = new HallLastBreathWriter(local, pageId, () => {
      const ctl = ctlRef.current;
      const audio = audioRef.current;
      const buf = bufferRef.current?.stats();
      const trackAt = lastTrackAtRef.current;
      return {
        st: ctl?.status ?? null,
        pos: audio && Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime) : null,
        up: Math.round((Date.now() - performance.timeOrigin) / 1000),
        n: tracksSinceLoadRef.current,
        trackAgeS: trackAt === null ? null : Math.round((Date.now() - trackAt) / 1000),
        bufN: buf?.tracks ?? null,
        bufMb: buf ? Math.round(buf.bytes / 104857.6) / 10 : null,
        dl: buf?.downloading ?? null,
        vis: document.visibilityState === "visible" ? "v" : "h",
        build: appVersion ? appVersion.slice(0, 8) : null,
        usageMb,
        cacheN,
      };
    });
    lastBreathRef.current = breath;
    breath.tick(true);
    const breathTimer = window.setInterval(() => breath.tick(), 5_000);
    const onVisibility = () => j.log("visibility");
    const onHide = (event: PageTransitionEvent) => {
      // A normal unload says goodbye; a page killed by the browser never does (crashSuspect).
      if (!event.persisted) {
        clearHallPageAlive(session);
        breath.goodbye();
      }
      j.log("page_hide", { persisted: event.persisted });
      void j.flush();
    };
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        markHallPageAlive(session, pageId);
        breath.alive();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    const snapshot = window.setInterval(() => {
      // t1390u follow-up: entries in the hall cache next to the origin storage use – tells whether
      // the multi-GB use seen on the hall iPhone is this buffer or something else.
      const countCache = countHallBufferEntries();
      const estimate = navigator.storage?.estimate?.bind(navigator.storage);
      const usage = estimate
        ? estimate().then((e) => (typeof e.usage === "number" ? Math.round(e.usage / 1048576) : null), () => null)
        : Promise.resolve<number | null>(null);
      void Promise.all([usage, countCache.catch(() => null)]).then(([u, c]) => {
        usageMb = u;
        cacheN = c;
        j.log("snapshot", { usageMb: u, cacheN: c });
      });
    }, HALL_JOURNAL_SNAPSHOT_MS);
    let lastHeld: boolean | null = null;
    const wakeWatch = window.setInterval(() => {
      const held = wakeLockRef.current?.held ?? null;
      if (held !== lastHeld) {
        lastHeld = held;
        j.log("wake_lock", { held });
      }
    }, 15_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      window.clearInterval(snapshot);
      window.clearInterval(wakeWatch);
      window.clearInterval(breathTimer);
      // The player left this page on purpose (not a killed page): say so for the next page.
      breath.goodbye();
      if (lastBreathRef.current === breath) lastBreathRef.current = null;
      void j.flush();
      j.dispose();
      if (journalRef.current === j) journalRef.current = null;
    };
  }, [canBeat]);

  const catalogKey = model && open ? workspaceControllerKey(model) : "";

  /** t1331u: the next HALL_BUFFER_TRACKS of the live queue, downloaded while the hall plays. */
  const bufferPlanRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    bufferPlanRef.current = () => {
      const buffer = bufferRef.current;
      const ctl = ctlRef.current;
      const current = modelRef.current;
      if (!buffer || !ctl || !current) return;
      const index = ctl.index >= 0 ? ctl.index : playbackRef.current.index;
      // The selected track (it may still be loading) keeps its copy until it sounds (review #1 F1).
      buffer.setPlan(
        hallBufferPlan(current.tracks, index, (cur, len) => cafeQueueNextIndex(playOrderRef.current, cur, len)),
        current.tracks[index]?.audioItemId ?? null,
      );
      void buffer.refill(ctl.status === "playing" || ctl.status === "loading");
    };
  });
  useEffect(() => {
    bufferPlanRef.current();
  }, [queueOrder]);

  useEffect(() => {
    if (!canBeat) {
      // Not a hall device (any more): copies left from an earlier pairing go.
      if (readHallBufferOwner()) void purgeHallBufferStorage();
      return;
    }
    const queue = new HallReportQueue((() => {
      try { return window.localStorage; } catch { return null; }
    })());
    reportQueueRef.current = queue;
    const flush = () => { if (navigator.onLine !== false) void queue.flush((s) => postPointUsage(s)); };
    const sync = () => {
      flush();
      bufferPlanRef.current();
    };
    flush();
    window.addEventListener("online", sync);
    return () => {
      window.removeEventListener("online", sync);
      if (reportQueueRef.current === queue) reportQueueRef.current = null;
    };
  }, [canBeat]);

  const bufferOwner = canBeat && open && model ? `${model.spaceId}:${model.locationId ?? ""}` : null;
  useLayoutEffect(() => {
    hallScopeRef.current = bufferOwner;
    if (!canBeat) {
      playingMarkerRef.current = null;
      return;
    }
    playingMarkerRef.current ??= new HallPlayingMarkerWriter(hallLocalStorage());
    // Another hall on this browser: its «was playing» never starts music here.
    const marker = readHallPlayingMarker(hallLocalStorage());
    if (bufferOwner && marker && marker.scope !== bufferOwner) clearHallPlayingMarker(hallLocalStorage());
  }, [canBeat, bufferOwner]);
  useEffect(() => {
    if (!bufferOwner) return;
    let cancelled = false;
    let buffer: HallOfflineBuffer | null = null;
    void (async () => {
      const store = await createHallBufferStore();
      if (cancelled) return;
      // Another hall used this browser before: its copies never play here.
      if (store && readHallBufferOwner() !== bufferOwner) {
        try { await store.clear(); } catch { /* best effort */ }
        if (cancelled) return;
      }
      if (store) writeHallBufferOwner(bufferOwner);
      const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
      buffer = new HallOfflineBuffer({
        store,
        sign: (audioItemId) => signWorkspaceTrack(modelRef.current?.spaceId ?? "cafe", audioItemId),
        fetchBlob: fetchTrackBlob,
        // t1365u: the hall iPhone starts tracks from the stream. t1390u: on iPhone / iPad only
        // HALL_BUFFER_IOS_TRACKS next tracks, streamed straight to disk, no copy in page memory
        // until a reconnect asks for it (no Cache Storage → no buffer at all).
        // Android / desktop keep the Blob download: measured in Chromium, streaming the body into
        // Cache Storage goes through the renderer and almost doubled its memory (≈ 850 vs 460 MB
        // peak, scripts/business-hall-buffer-memory-webkit-browser.mts), while a Blob lives in the
        // browser process. Everywhere: no buffer download during the first
        // HALL_BUFFER_IOS_START_DELAY_MS of a track (the track change keeps one request).
        fetchResponse: fetchTrackResponse,
        startDelayMs: HALL_BUFFER_IOS_START_DELAY_MS,
        ...(isAppleTouchDevice(navigator)
          ? { maxTracks: HALL_BUFFER_IOS_TRACKS, streamToStore: true, lazyCopies: true }
          : {}),
        createUrl: (blob) => URL.createObjectURL(blob),
        revokeUrl: (url) => URL.revokeObjectURL(url),
        window: (audioItemId) => {
          const item = ctlRef.current?.items.find((i) => i.audioItemId === audioItemId);
          return item ? { until: item.playableUntil ? item.playableUntil.getTime() : null } : null;
        },
        isOnline: () => navigator.onLine !== false,
        estimate: storage?.estimate ? () => storage.estimate() : undefined,
        onExpired: (audioItemId) => ctlRef.current?.localExpired(audioItemId),
        // Review #1 F3: the server refused a buffer download – same as a refused track start:
        // stop the hall now (the buffer has already purged itself).
        onNoAccess: () => {
          void ctlRef.current?.applyManifest(null);
          (fadeRef.current ?? audioRef.current)?.pause();
        },
        onChange: () => {
          /* t1333u: count stays local; owner UI no longer shows a buffer line. */
        },
      });
      bufferRef.current = buffer;
      if (store && storage?.persist) void storage.persist().catch(() => {});
      await buffer.rehydrate();
      if (cancelled) return;
      bufferPlanRef.current();
      buffer.sweep();
    })();
    return () => {
      cancelled = true;
      if (buffer) {
        buffer.dispose();
        if (bufferRef.current === buffer) bufferRef.current = null;
      }
    };
  }, [bufferOwner]);

  useEffect(() => {
    const audio = audioRef.current;
    const current = modelRef.current;
    if (!audio || !open || !current || !catalogKey) return;
    const fader = new FadingAudio(audio);
    fader.setVolume(playbackRef.current.volume);
    fadeRef.current = fader;
    // t1314u loop mode (hall-loop-audio.ts) is rolled back (t1335u): prepareLoopAudio returns false
    // while HALL_LOOP_MODE_ENABLED is off, so iPhone uses the PR 1192 early handoff + "ended" again.
    const loopMode = prepareLoopAudio(audio, navigator);
    const ctl = new Controller(
      {
        audio: fader,
        sign: (audioItemId) => signWorkspaceTrack(modelRef.current?.spaceId ?? "cafe", audioItemId),
        // t1331u: hall device copy of the track (offline buffer), preferred over the network.
        localSource: (audioItemId, durationSec) => bufferRef.current?.localSource(audioItemId, durationSec) ?? null,
        onSource: (audioItemId, local) => {
          if (audioItemId) bufferRef.current?.pin(audioItemId);
          if (audioItemId) {
            tracksSinceLoadRef.current++;
            lastTrackAtRef.current = Date.now();
            journal("track", { local });
          }
        },
        // t1390u: hall iPhone – the next link after HALL_IOS_PRESIGN_DELAY_SEC of play, so only the
        // access re-check goes out at the boundary; a reconnect loads the lazy device copy.
        // t1390u: hall devices (iPhone and Android) sign the next track 30 s in, so a track change
        // sends one request (the access re-check), not three at once.
        presignDelaySec: () => (canBeatRef.current ? HALL_IOS_PRESIGN_DELAY_SEC : 0),
        prepareLocal: (audioItemId) => bufferRef.current?.prepare(audioItemId),
        // t1390u: self-resume after a pause nobody asked for + the 10 s watchdog (hall devices).
        element: canBeatRef.current
          ? () => ({ paused: audio.paused, ended: audio.ended, currentTime: audio.currentTime })
          : undefined,
        onEvent: (kind, data) => {
          if (kind === "autoplay_blocked") autoResumeRefusedRef.current = autoResumeRunningRef.current;
          if (kind === "autoplay_blocked" || kind === "unexpected_pause" || kind === "self_resume_ok"
            || kind === "self_resume_failed" || kind === "self_resume_ended" || kind === "watchdog_stuck" || kind === "recover") {
            journal(kind, kind === "autoplay_blocked" ? { ...data, afterReload: autoResumeRunningRef.current } : data);
          }
        },
        // Locked iPhone (t1303u): hand the next track over before the end, never wait for the
        // network at the boundary.
        backgroundAdvance: () => lockedAppleScreen(document, navigator),
        loopAdvance: () => loopMode && audio.loop === true,
        // t1365u: hall iPhone – a fresh pre-signed stream wins over the device copy at a normal
        // start (no whole-track blob loaded into the page at every boundary); the copy stays the
        // source for reconnects, starts without a ready link and offline.
        streamFirst: () => streamFirstRef.current,
        nextIndex: (currentIndex, length) => cafeQueueNextIndex(playOrderRef.current, currentIndex, length),
        previousIndex: (currentIndex, length) => cafeQueuePreviousIndex(playOrderRef.current, currentIndex, length),
        onChange: () => {
          const current = ctlRef.current;
          if (!current) return;
          // The «Включить музыку» tap must be reachable: never keep it inside a closed bar.
          if (current.needsGesture) setBarDismissed(false);
          const trackId = current.audibleItemId ?? current.current?.audioItemId ?? null;
          if (trackId && trackId !== lastTrackForReloadRef.current) {
            const hadPrevious = lastTrackForReloadRef.current != null;
            lastTrackForReloadRef.current = trackId;
            recentPlayedRef.current = rememberPlayedId(recentPlayedRef.current, trackId);
            // A track boundary is never a reload moment (t1346u): music is still meant to play.
            if (hadPrevious) {
              // Near the end of the unique queue: rebuild between tracks (locked iPhone safe).
              tryQueueTopUpRef.current();
            }
          }
          setView((prev) => ({
            ...prev,
            status: current.status,
            message: current.message,
            needsGesture: current.needsGesture,
            index: current.index < 0 ? prev.index : current.index,
          }));
          // t1331u: access gone – every copy on the device goes too; otherwise follow the queue.
          if (current.status === "no_access") {
            void bufferRef.current?.purge();
            reportQueueRef.current?.clear();
          } else bufferPlanRef.current();
          // Any fresh start (also one not wrapped below) ends a deliberate pause.
          wakeIntentRef.current.observe(current.status);
          syncWakeLock();
          notePlayingMarker();
          if (current.status === "paused" || current.status === "idle") {
            trySafeBuildReload();
          }
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
      notePlayingMarker();
      remember({ index: ctl.index < 0 ? playbackRef.current.index : ctl.index, positionSec: audio.currentTime }, false, true);
    };
    const sendReport = () => reportRef.current();
    const onPlaying = () => {
      fader.nudge();
      evidenceRef.current.onPlaying(audio.currentTime);
      sendReport();
    };
    const onEnded = () => void ctl.onEnded();
    const onSeeking = () => ctl.onSeeking(audio.currentTime, audio.duration);
    const onError = () => {
      journal("el_error", { code: audio.error?.code ?? null });
      void ctl.onError();
    };
    // t1390u: a pause nobody asked for (status still "playing") is played again by the controller.
    const onPause = () => {
      sendReport();
      journal("el_pause", { ended: audio.ended });
      ctl.onElementPause();
    };
    // Network recovery (P0-3): a stall that does not move on, or the connection coming
    // back, is handled by the controller (backoff retries, resume at the position).
    const onWaiting = () => {
      journal("el_waiting");
      ctl.onWaiting();
    };
    const onStalled = () => {
      journal("el_stalled");
      ctl.onWaiting();
    };
    const onOnline = () => void ctl.onOnline();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void ctl.onOnline();
        // A start refused while the screen was locked: try once more now, without a tap.
        void ctl.onForeground();
      } else fader.prepareForBackground();
    };
    // Screen lock / background (t1285u): timers and the ramp may freeze there; never leave the
    // hall music at a mid-fade (or zero) volume. A user pause in its fade-out completes now.
    const onBackground = () => fader.prepareForBackground();
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("stalled", onStalled);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onBackground);
    document.addEventListener("freeze", onBackground);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("seeking", onSeeking);
    audio.addEventListener("error", onError);
    const reportTimer = window.setInterval(sendReport, 15_000);
    // t1390u: «position does not move for 10 s while playing» – hall devices only.
    const watchdogTimer = canBeatRef.current ? window.setInterval(() => ctl.watchdog(), HALL_WATCHDOG_TICK_MS) : null;
    return () => {
      window.clearInterval(reportTimer);
      if (watchdogTimer !== null) window.clearInterval(watchdogTimer);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onStalled);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onBackground);
      document.removeEventListener("freeze", onBackground);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("seeking", onSeeking);
      audio.removeEventListener("error", onError);
      if (loopMode) audio.loop = false;
      ctl.dispose();
      ctlRef.current = null;
      syncWakeLock();
      fader.dispose();
      if (fadeRef.current === fader) fadeRef.current = null;
    };
  }, [catalogKey, open, remember, syncWakeLock, notePlayingMarker, journal]);

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
        void bufferRef.current?.purge();
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
    if (Number.isFinite(audio.duration) && target < audio.duration) {
      ctlRef.current?.noteManualSeek();
      audio.currentTime = target;
    }
  }, [view.status]);

  const toggle = useCallback(async () => {
    const ctl = ctlRef.current;
    const current = modelRef.current;
    if (!ctl || !current || !accessRef.current?.allowsPlayback()) return;
    remotePausedRef.current = false;
    const index = playbackRef.current.index;
    const starting = ctl.status !== "playing" && ctl.status !== "loading";
    if (starting) setBarDismissed(false);
    if (ctl.status === "playing" || ctl.status === "loading") {
      // Deliberate pause (here or from the owner's phone): the screen may go dark.
      wakeIntentRef.current.markPaused();
      syncWakeLock();
      await ctl.toggle();
    } else if (ctl.status === "paused" && ctl.current) {
      await wakeWhileStarting(() => ctl.toggle());
    } else {
      await wakeWhileStarting(() => ctl.playIndex(index));
    }
    // Mid skip the element still holds the previous track's time: the chosen one starts at 0.
    const positionSec = ctl.fadingOutPrevious ? 0 : (audioRef.current?.currentTime ?? 0);
    remember({ index: ctl.index < 0 ? index : ctl.index, positionSec }, ctl.status === "playing");
    reportPlayback();
  }, [remember, reportPlayback, syncWakeLock, wakeWhileStarting]);

  const next = useCallback(async (signal?: AbortSignal) => {
    const ctl = ctlRef.current;
    const current = modelRef.current;
    if (!ctl || !current || !accessRef.current?.allowsPlayback()) return;
    remotePausedRef.current = false;
    setBarDismissed(false);
    seekRef.current = 0;
    evidenceRef.current.reset(0);
    let aborted = false;
    await wakeWhileStarting(async () => {
      if (soundInstallRef.current) await soundInstallRef.current;
      if (signal?.aborted) {
        aborted = true;
        // Never reached the controller: an earlier deliberate pause stays in force.
        return false;
      }
      await ctl.next();
    });
    if (aborted) return;
    remember({ index: ctl.index < 0 ? 0 : ctl.index, positionSec: 0 }, true);
    reportPlayback();
  }, [remember, reportPlayback, wakeWhileStarting]);

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
    await wakeWhileStarting(async () => {
      if (soundInstallRef.current) await soundInstallRef.current;
      await ctl.previous();
    });
    remember({ index: ctl.index < 0 ? 0 : ctl.index, positionSec: 0 }, true);
    reportPlayback();
  }, [remember, reportPlayback, wakeWhileStarting]);

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
        if (json.commands.length > 0) {
          refreshPointSoundRef.current();
          remoteCommandBusyRef.current = true;
        }
        await runPointCommands(json.commands, {
          ready: () => !!ctlRef.current && !!modelRef.current?.tracks.length
            && accessRef.current?.allowsPlayback() === true,
          status: () => ctlRef.current?.status ?? "idle",
          toggle: (signal) => commandTransport(signal, () => toggleRef.current()),
          next: (signal) => commandTransport(signal, () => nextRef.current(signal)),
          applied: pointCommandApplied({
            status: () => ctlRef.current?.status,
            audio: () => audioRef.current,
            fade: () => fadeRef.current,
            ownerPaused: () => {
              remotePausedRef.current = true;
              // t1365u (review of b2853392): also when the hall was already silent (paused /
              // idle / iOS autoplay refusal) and the pause itself was a no-op – the owner chose
              // silence, so a reloaded page must not start the music by itself.
              wakeIntentRef.current.markPaused();
              playingMarkerRef.current?.clear();
              syncWakeLock();
            },
          }),
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
        remoteCommandBusyRef.current = false;
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
  }, [canBeat, syncWakeLock]);

  // Owner mirror of the live hall device (t1283u). Owner browser only; the hall device itself
  // is the source of truth and never reads this.
  const [hall, setHall] = useState<{ data: HallNowPlaying; at: number; locationId: string } | null>(null);
  const [hallPending, setHallPending] = useState<HallPending | null>(null);
  /** Wall clock for the mirror, set from timers and answers (render stays pure). */
  const [hallNow, setHallNow] = useState(0);
  const hallLocation = !pointReports && open ? (model?.locationId ?? null) : null;
  const hallPollRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!hallLocation) return;
    let stop = false;
    let inFlight = false;
    const poll = async () => {
      if (stop || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/business/point", {
          ...JSON_POST,
          body: JSON.stringify({ action: "hall-now", locationId: hallLocation }),
          signal: AbortSignal.timeout(5_000),
        });
        const data = parseHallNowPlaying(await res.json());
        if (stop) return;
        const at = Date.now();
        setHall(data ? { data, at, locationId: hallLocation } : null);
        setHallNow(at);
        // The hall reported something new: its own state wins over the pending button state.
        const key = data ? hallKey(data) : "";
        setHallPending((pending) => (pending && pending.from !== key ? null : pending));
      } catch {
        /* Keep the last snapshot; it ends when the hall stops answering (server freshness). */
      } finally {
        inFlight = false;
      }
    };
    hallPollRef.current = () => void poll();
    void poll();
    const timer = window.setInterval(() => void poll(), HALL_MIRROR_POLL_MS);
    const wake = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      stop = true;
      hallPollRef.current = () => {};
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [hallLocation]);
  // A snapshot of another venue (selection changed) or a closed player never shows.
  const liveHall = hallLocation && hall?.locationId === hallLocation ? hall : null;
  const mirror = liveHall && model ? hallMirrorView(liveHall.data, model.tracks, (hallNow - liveHall.at) / 1000) : null;
  const hallMirror = mirror !== null;
  useLayoutEffect(() => {
    hallMirrorRef.current = hallMirror;
  }, [hallMirror]);
  const mirrorPlaying = mirror?.status === "playing";
  useEffect(() => {
    if (!mirrorPlaying) return;
    // The hall moves on: the shown position follows it between snapshots.
    const timer = window.setInterval(() => setHallNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [mirrorPlaying]);
  useEffect(() => {
    if (!hallMirror) return;
    // A live hall device took over the owner screens: no second copy plays on this phone.
    const ctl = ctlRef.current;
    if (ctl && (ctl.status === "playing" || ctl.status === "loading")) void toggleRef.current();
  }, [hallMirror]);
  const hallSnapshotKey = liveHall ? hallKey(liveHall.data) : "";
  const sendHall = useCallback(async (type: PointCommandType) => {
    const locationId = modelRef.current?.locationId;
    if (!locationId) return;
    if (type !== "next_track") {
      const at = Date.now();
      setHallNow(at);
      setHallPending({ status: type === "pause" ? "paused" : "playing", until: at + HALL_MIRROR_PENDING_MS, from: hallSnapshotKey });
    }
    try {
      const res = await fetch("/api/business/point", {
        ...JSON_POST,
        body: JSON.stringify({ action: "enqueue", id: crypto.randomUUID(), locationId, type }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok !== true) throw new Error(json.error ?? "enqueue_failed");
      setSaveNote(null);
    } catch {
      setHallPending(null);
      setSaveNote("Не удалось отправить команду в зал. Попробуйте ещё раз.");
    }
    window.setTimeout(() => hallPollRef.current(), 2_000);
  }, [hallSnapshotKey]);

  const playIndex = useCallback(async (index: number) => {
    const current = modelRef.current;
    if (!current || !accessRef.current?.allowsPlayback()) return;
    setBarDismissed(false);
    seekRef.current = 0;
    evidenceRef.current.reset(0);
    await wakeWhileStarting(async () => { await ctlRef.current?.playIndex(index); });
    remember({ index, positionSec: 0 }, true);
    reportPlayback();
  }, [remember, reportPlayback, wakeWhileStarting]);

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
    ctl?.queueChanged();
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
    ctl?.queueChanged();
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

  const resolveTopUpSound = useCallback((): {
    character: GuestCoffeeCharacter;
    direction: GuestCoffeeDirection;
    daypart: CafeDaypart;
    energyOffset: number;
    feedback: readonly CafeQueueFeedback[];
  } | null => {
    const hall = hallSoundRef.current;
    const feedback = hallFeedbackRef.current.length > 0
      ? hallFeedbackRef.current
      : (() => {
          try {
            return parseCafeQueueFeedback(window.sessionStorage.getItem(CAFE_QUEUE_FEEDBACK_KEY));
          } catch {
            return [] as CafeQueueFeedback[];
          }
        })();
    if (hall) return { ...hall, feedback };
    try {
      const stored = coffeeStorage.getItem(BUSINESS_SOUND_PROFILE_STORAGE_KEY);
      const profile = parseBusinessSoundProfile(stored);
      const prefs = parseCafeQueuePrefs(coffeeStorage.getItem(CAFE_QUEUE_PREFS_KEY));
      const locationId = modelRef.current?.locationId ?? null;
      const hours = parseCafeDaypartHours(coffeeStorage.getItem(cafeDaypartHoursKey(locationId)));
      const now = new Date();
      const minute = now.getHours() * 60 + now.getMinutes();
      const daypart = effectiveCafeDaypartAt(prefs.daypartMode, minute, hours)
        ?? (profile.daypart === "morning" || profile.daypart === "day" || profile.daypart === "evening"
          ? profile.daypart
          : null);
      if (!daypart) return null;
      return {
        character: profile.character,
        direction: profile.direction,
        daypart,
        energyOffset: prefs.energyOffset,
        feedback,
      };
    } catch {
      return null;
    }
  }, []);

  const tryQueueTopUp = useCallback(async () => {
    if (!queueTopUpOwnsPlayback({ pointDevice: pointReports, hallMirror: hallMirrorRef.current })) return;
    const current = modelRef.current;
    if (!current || current.tracks.length === 0) return;
    const ctl = ctlRef.current;
    const index = ctl && ctl.index >= 0 ? ctl.index : playbackRef.current.index;
    if (index < 0) return;
    const order = playOrderRef.current ?? current.tracks.map((_, i) => i);
    const ahead = uniqueAheadCount(current.tracks, order, index);
    if (!shouldTopUpQueue(ahead)) return;
    const guard = topUpGuardRef.current;
    if (!guard.canStart() || !guard.begin()) return;
    const sound = resolveTopUpSound();
    if (!sound) {
      guard.fail();
      return;
    }
    const playingId = current.tracks[index]?.audioItemId;
    const exclude = recentPlayedRef.current.slice(0, CAFE_QUEUE_RECENT_RING);
    const gen = ++rebuildGen.current;
    try {
      const params = new URLSearchParams({ space: current.spaceId });
      const res = await fetch(`/api/business/workspace/queue?${params.toString()}`, {
        ...JSON_POST,
        body: JSON.stringify({
          character: sound.character,
          direction: sound.direction,
          daypart: sound.daypart,
          energyOffset: sound.energyOffset,
          feedback: sound.feedback,
          boundaryAudioItemId: playingId,
          seed: Math.floor(Math.random() * 0x7fffffff),
          excludeAudioItemIds: exclude,
        }),
      });
      if (rebuildGen.current !== gen) {
        guard.fail();
        return;
      }
      if (!res.ok) {
        guard.fail();
        return;
      }
      const json = await res.json() as { ok?: boolean; order?: unknown };
      if (rebuildGen.current !== gen || json.ok !== true || !Array.isArray(json.order)) {
        guard.fail();
        return;
      }
      const indices = cafeQueueIndices(current.tracks, json.order);
      if (indices.length === 0) {
        guard.fail();
        return;
      }
      const nextOrder = spliceTopUpOrder(indices, index, current.tracks, exclude);
      playOrderRef.current = nextOrder;
      setQueueOrderState(nextOrder);
      // Pre-sign the new next URL so a locked iPhone never waits at the boundary.
      ctlRef.current?.queueChanged();
      guard.succeed();
    } catch {
      guard.fail();
    }
  }, [pointReports, resolveTopUpSound]);

  useEffect(() => {
    tryQueueTopUpRef.current = () => { void tryQueueTopUp(); };
  }, [tryQueueTopUp]);

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
        // The next track changed: pre-sign it now (a locked iPhone cannot wait at the boundary).
        ctl?.queueChanged();
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
      const run = applySound(sound, (daypart) => {
        hallSoundRef.current = { character: sound.character, direction: sound.direction, daypart, energyOffset: sound.energyOffset };
        return rebuildFromProfile({
          character: sound.character,
          direction: sound.direction,
          daypart,
          feedback: hallFeedbackRef.current,
          energyOffset: sound.energyOffset,
          keepCurrent: true,
        });
      }).finally(() => {
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

  // t1365u (Sergey t1366u–t1368u): the page of a hall that was playing was opened again (the
  // browser reloaded it, e.g. Safari after its web process died): start the music by itself, no
  // message, no hint. Once per page; only a hall device, only the same hall, only a recent marker,
  // never over a deliberate pause (the marker is gone then) or an owner pause.
  const autoResumeTriedRef = useRef(false);
  useEffect(() => {
    if (!canBeat || !open || !catalogKey || autoResumeTriedRef.current) return;
    const scope = hallScopeRef.current;
    const storage = hallLocalStorage();
    const marker = readHallPlayingMarker(storage);
    if (!shouldAutoResumeHall({ marker, scope, now: Date.now(), maxAgeMs: HALL_AUTO_RESUME_MAX_AGE_MS })) {
      autoResumeTriedRef.current = true;
      // Too old (phone put away, tab closed for the night): a later load must not start either.
      if (marker && marker.scope === scope) clearHallPlayingMarker(storage);
      return;
    }
    let stop = false;
    const startedAt = Date.now();
    let timer: number | null = null;
    const attempt = () => {
      timer = null;
      if (stop || autoResumeTriedRef.current) return;
      const ctl = ctlRef.current;
      const ready = !!ctl && !!modelRef.current?.tracks.length && accessRef.current?.allowsPlayback() === true;
      if (!ready) {
        if (Date.now() - startedAt < HALL_AUTO_RESUME_READY_MS) timer = window.setTimeout(attempt, HALL_AUTO_RESUME_POLL_MS);
        else autoResumeTriedRef.current = true;
        return;
      }
      autoResumeTriedRef.current = true;
      if (remotePausedRef.current || wakeIntentRef.current.deliberatelyPaused) return;
      // Something already started (a tap, an owner command): nothing to do.
      if (ctl.status !== "idle" && !(ctl.status === "paused" && ctl.needsGesture)) return;
      // Same path as the round Play button: saved track, saved position, wake lock, reports.
      // A refusal (iOS without a tap) leaves the track loaded; the foreground / first-touch
      // retries below pick it up.
      journal("auto_resume", { markerAgeS: marker ? Math.round((Date.now() - marker.at) / 1000) : null });
      autoResumeRunningRef.current = true;
      void toggleRef.current().finally(() => {
        autoResumeRunningRef.current = false;
      });
    };
    attempt();
    return () => {
      stop = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [canBeat, open, catalogKey, journal]);

  // t1365u: a start the browser refused (needsGesture) while this hall means to play resumes on
  // the very first touch anywhere on the hall screen – not a button to look for, nothing shown.
  // Controls keep their own handlers (one tap is never «resume + pause»).
  useEffect(() => {
    if (!canBeat || typeof document === "undefined") return;
    let lastTry = 0;
    const onTouch = (event: Event) => {
      const ctl = ctlRef.current;
      if (!ctl || ctl.status !== "paused" || !ctl.needsGesture) return;
      // touchend and the click that follows it are one tap.
      const now = Date.now();
      if (now - lastTry < 1_500) return;
      if (remotePausedRef.current || wakeIntentRef.current.deliberatelyPaused) return;
      const target = event.target as { closest?: (selector: string) => unknown } | null;
      if (target && typeof target.closest === "function" && target.closest(HALL_TOUCH_RESUME_SKIP_SELECTOR)) return;
      lastTry = now;
      void toggleRef.current();
    };
    document.addEventListener("touchend", onTouch, true);
    document.addEventListener("click", onTouch, true);
    document.addEventListener("keydown", onTouch, true);
    return () => {
      document.removeEventListener("touchend", onTouch, true);
      document.removeEventListener("click", onTouch, true);
      document.removeEventListener("keydown", onTouch, true);
    };
  }, [canBeat]);

  const dismissBar = useCallback(async () => {
    const ctl = ctlRef.current;
    const audio = audioRef.current;
    const fader = fadeRef.current;
    setBarDismissed(true);
    // Closing the bar is a deliberate stop: the hall screen may go dark, even after an owner pause.
    wakeIntentRef.current.markPaused({ stop: true });
    playingMarkerRef.current?.clear();
    syncWakeLock();
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
  }, [syncWakeLock]);

  const revealNowPlaying = useCallback(() => {
    document.querySelector("[data-testid='biz-now-playing']")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const seek = useCallback((ratio: number) => {
    // Seek is local. The owner accepts a stale-permission window of ~5 s within
    // the current track: this does not change the music. Commands refresh it sooner.
    // Hall mirror: the bar shows the hall; there is no hall seek command.
    if (hallMirrorRef.current) return;
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    // The previous track is fading out after a skip: the bar already shows the chosen one.
    if (ctlRef.current?.fadingOutPrevious) return;
    const nextTime = Math.min(audio.duration, Math.max(0, ratio * audio.duration));
    ctlRef.current?.noteManualSeek();
    audio.currentTime = nextTime;
    setView((prev) => ({ ...prev, currentTime: nextTime }));
    remember({ positionSec: nextTime }, false, true);
  }, [remember]);

  const shownView: View = hallShownView(view, mirror, hallPending, hallNow);
  const shownToggle = mirror
    ? async () => { await sendHall(shownView.status === "playing" ? "pause" : "resume"); }
    : toggle;
  const track = mirror ? (model?.tracks[mirror.index] ?? null) : (model?.tracks[view.index] ?? model?.tracks[playback.index] ?? null);
  const author = track?.authorName?.trim() || "";
  const nowTitle = track ? (author ? `${track.title} – ${author}` : track.title) : null;
  const duration = shownView.duration > 0 ? shownView.duration : (track?.durationSeconds ?? 0);
  const playing = shownView.status === "playing" || shownView.status === "loading";

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
  const deviceNext = async () => {
    if (mirror) return sendHall("next_track");
    if (await authorizeMusicChange()) await next();
  };
  // Mirror: the hall has no «previous» / «play this one» command; the queue is the hall's.
  const devicePrevious = async () => { if (!mirror && await authorizeMusicChange()) await previous(); };
  const devicePlayIndex = async (index: number) => { if (!mirror && await authorizeMusicChange()) await playIndex(index); };
  const steerHall: CabinetPlayerApi["steerHall"] = async (feedback, fallback) => {
    if (!pointReports || !pointCanEdit) return "failed";
    if (!(await authorizeMusicChange())) return "failed";
    hallFeedbackRef.current = feedback;
    if (soundInstallRef.current) await soundInstallRef.current;
    const sound = hallSoundRef.current ?? (fallback ? { ...fallback, energyOffset: 0 } : null);
    if (!sound) return "failed";
    const result = await rebuildFromProfile({ ...sound, feedback, keepCurrent: true });
    return result === "applied" ? "applied" : "failed";
  };

  const api: CabinetPlayerApi = {
    accessModel: model,
    pointDevice: pointReports,
    // Mirror: only pause / resume / next exist as hall commands; the queue is the hall's.
    canChangeMusic: !mirror && (!pointReports || pointCanEdit),
    hallMirror,
    canNext: mirror ? true : !pointReports || pointCanEdit,
    adopt,
    release,
    view: shownView,
    toggle: shownToggle,
    next: deviceNext,
    previous: devicePrevious,
    playIndex: devicePlayIndex,
    setVolume,
    seek: pointReports && !pointCanEdit ? () => {} : seek,
    volume: playback.volume,
    saveNote,
    queueOrder: mirror ? mirror.queueOrder : queueOrder,
    queueAheadCount: mirror ? mirror.aheadCount : null,
    setQueueOrder: pointReports ? () => {} : setQueueOrder,
    applyAtmosphereQueue: pointReports ? () => {} : applyAtmosphereQueue,
    rebuildFromProfile: pointReports ? async () => "deferred" : rebuildFromProfile,
    cancelAtmosphereRebuild,
    steerHall,
  };

  const coverSrc = track ? cabinetAlbumCoverUrl({ coverUrl: track.coverUrl }) : null;

  // Lock screen «Now Playing» (t1303u): the page that really plays keeps title, cover and
  // play / pause / next there. Owner mirror: nothing plays on this phone, the session is cleared.
  const sessionRunRef = useRef<(action: SessionAction) => void>(() => {});
  useLayoutEffect(() => {
    sessionRunRef.current = (action) => runSessionAction(action, ctlRef.current?.status, {
      toggle: () => toggleRef.current(),
      next: () => deviceNext(),
    });
  });
  const session = playerSessionState({
    open,
    mirror: mirror !== null,
    track,
    artwork: coverSrc && failedCover !== coverSrc ? coverSrc : null,
    status: view.status,
    pointDevice: pointReports,
    pointCanEdit,
  });
  const sessionKey = session ? JSON.stringify(session) : "";
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const state = sessionKey ? (JSON.parse(sessionKey) as PlayerSessionState) : null;
    syncPlayerMediaSession(
      navigator.mediaSession,
      state,
      (action) => sessionRunRef.current(action),
      (init) => (typeof MediaMetadata === "undefined" ? null : new MediaMetadata(init)),
    );
  }, [sessionKey]);
  useEffect(() => () => {
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      syncPlayerMediaSession(navigator.mediaSession, null, () => {}, () => null);
    }
  }, []);

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
          loading={shownView.status === "loading"}
          onToggle={() => void shownToggle()}
          onNext={() => void deviceNext()}
          nextDisabled={pointReports && !pointCanEdit}
          onClose={() => void dismissBar()}
          onOpen={revealNowPlaying}
          onSeek={pointReports && !pointCanEdit ? undefined : seek}
          currentTime={shownView.currentTime}
          duration={duration}
          timeLabel={`${formatPlaybackClock(shownView.currentTime)} / ${formatPlaybackClock(duration)}`}
          volume={playback.volume}
          onVolume={mirror ? undefined : setVolume}
          message={shownView.message ? musicPlayerMessage(shownView.message) : null}
          ctaLabel={shownView.needsGesture ? ENABLE_MUSIC_LABEL : null}
          onCta={() => void shownToggle()}
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
