/**
 * Seek-safe HTMLMediaElement start/stop for Studio transport.
 *
 * Setting `currentTime` to a non-zero source offset starts an async seek
 * (`seeking === true`, `currentTime` stays at the old value until `seeked`).
 * Calling `play()` in that window rejects with AbortError on Range-backed
 * catalog audio, and assigning `currentTime` again (once per animation frame
 * while drift still looks large) aborts the seek forever — audible silence.
 * A `play()` promise that settles after Pause can also resume the element
 * that was mid-seek while a zero-offset track, whose `play()` already
 * settled, stays paused.
 *
 * Only the current playback generation may start or keep an element playing.
 * Query strings are stripped from diagnostic src values so signed URLs are
 * not retained.
 */

export const STUDIO_MEDIA_SEEK_EPSILON_SECONDS = 0.03;
export const STUDIO_CATALOG_PREVIEW_AUDIO_ROLE = "catalog-preview";
export const STUDIO_MEDIA_PLAY_FAILED_MESSAGE =
  "Не удалось запустить воспроизведение дорожки.";

const SEEK_WAIT_TIMEOUT_MS = 8000;
const OUTCOME_LIMIT = 32;

export type StudioControllableMedia = {
  src: string;
  currentTime: number;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly seeking: boolean;
  readonly readyState: number;
  readonly networkState: number;
  play: () => Promise<void>;
  pause: () => void;
  load?: () => void;
  removeAttribute?: (qualifiedName: string) => void;
};

export type StudioMediaPlayOutcome = {
  generation: number;
  playCalled: boolean;
  playSettled: "pending" | "resolved" | "rejected" | "skipped";
  errorName: string | null;
  currentTimeBeforeSeek: number;
  currentTimeAfterSettle: number;
  targetSeek: number | null;
  seeking: boolean;
  readyState: number;
  pausedAfterSettle: boolean;
  started: boolean;
  stale: boolean;
};

export type StudioAudioElementRole = "project-runtime" | "catalog-preview";

export type StudioAudioElementDiagnostic = {
  role: StudioAudioElementRole;
  trackId: string | null;
  sourceType: string | null;
  src: string;
  paused: boolean;
  currentTime: number;
  readyState: number;
  networkState: number;
  seeking: boolean;
};

type MediaSlot = {
  token: number;
  suppressResume: boolean;
  pending: boolean;
  blockedGeneration: number | null;
  seekingTo: number | null;
  deferredSeek: number | null;
  bound: boolean;
};

type MediaEventTarget = {
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

const slots = new WeakMap<object, MediaSlot>();
const outcomes: StudioMediaPlayOutcome[] = [];
let debugLogging = false;
let lastPauseDiagnostics: readonly StudioAudioElementDiagnostic[] = [];

function slotFor(media: object): MediaSlot {
  let slot = slots.get(media);
  if (!slot) {
    slot = {
      token: 0,
      suppressResume: false,
      pending: false,
      blockedGeneration: null,
      seekingTo: null,
      deferredSeek: null,
      bound: false,
    };
    slots.set(media, slot);
  }
  return slot;
}

function near(actual: number, target: number): boolean {
  return (
    Number.isFinite(actual) &&
    Number.isFinite(target) &&
    Math.abs(actual - target) <= STUDIO_MEDIA_SEEK_EPSILON_SECONDS
  );
}

function haveMetadata(media: StudioControllableMedia): boolean {
  return media.readyState >= 1;
}

function eventTarget(media: StudioControllableMedia): MediaEventTarget {
  return media as StudioControllableMedia & MediaEventTarget;
}

export function studioMediaErrorName(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    typeof (error as { name: unknown }).name === "string" &&
    (error as { name: string }).name
  ) {
    return (error as { name: string }).name;
  }
  return "unknown";
}

export function setStudioMediaPlaybackDebugLogging(enabled: boolean) {
  debugLogging = enabled;
}

export function readStudioMediaPlayOutcomes(): readonly StudioMediaPlayOutcome[] {
  return outcomes;
}

export function resetStudioMediaPlaybackTestState() {
  outcomes.length = 0;
  lastPauseDiagnostics = [];
  debugLogging = false;
}

function rememberOutcome(outcome: StudioMediaPlayOutcome) {
  outcomes.push(outcome);
  if (outcomes.length > OUTCOME_LIMIT) {
    outcomes.shift();
  }
  if (debugLogging) {
    console.info("[studio-playback]", outcome);
  }
}

function bindMediaElement(media: StudioControllableMedia) {
  const slot = slotFor(media);
  if (slot.bound) return;
  slot.bound = true;
  const target = eventTarget(media);
  target.addEventListener?.("loadedmetadata", () => {
    const current = slotFor(media);
    const deferred = current.deferredSeek;
    if (deferred == null) return;
    current.deferredSeek = null;
    seekStudioMediaElementIfNeeded(media, deferred);
  });
  target.addEventListener?.("seeked", () => {
    const current = slotFor(media);
    current.seekingTo = null;
    if (!current.suppressResume) return;
    media.pause();
    queueMicrotask(() => {
      if (slotFor(media).suppressResume) {
        media.pause();
      }
    });
  });
}

/**
 * Assign `currentTime` at most once per target while a seek is already in
 * flight. A second assignment restarts the browser seek and keeps the element
 * silent if it happens every animation frame.
 */
export function seekStudioMediaElementIfNeeded(
  media: StudioControllableMedia,
  time: number,
): "skipped" | "in-flight" | "settled" | "deferred" {
  if (!Number.isFinite(time) || time < 0) {
    return "skipped";
  }
  bindMediaElement(media);
  const slot = slotFor(media);
  if (media.seeking && slot.seekingTo != null && near(slot.seekingTo, time)) {
    return "in-flight";
  }
  if (!media.seeking && haveMetadata(media) && near(media.currentTime, time)) {
    slot.seekingTo = null;
    slot.deferredSeek = null;
    return "settled";
  }

  const assign = (): "in-flight" | "settled" | "deferred" => {
    try {
      slot.seekingTo = time;
      media.currentTime = time;
    } catch {
      slot.seekingTo = null;
      slot.deferredSeek = time;
      return "deferred";
    }
    if (!media.seeking && near(media.currentTime, time)) {
      slot.seekingTo = null;
      slot.deferredSeek = null;
      return "settled";
    }
    if (media.seeking || !near(media.currentTime, time)) {
      if (!media.seeking && !haveMetadata(media)) {
        slot.seekingTo = null;
        slot.deferredSeek = time;
        return "deferred";
      }
      return "in-flight";
    }
    slot.seekingTo = null;
    return "settled";
  };

  if (!haveMetadata(media)) {
    slot.deferredSeek = time;
    return assign();
  }
  slot.deferredSeek = null;
  return assign();
}

export function isStudioMediaPlaybackPending(media: object): boolean {
  return slotFor(media).pending;
}

export function isStudioMediaStartBlocked(
  media: object,
  generation: number,
): boolean {
  return slotFor(media).blockedGeneration === generation;
}

/**
 * Invalidate in-flight play/seek completions. Does not itself pause; callers
 * pause synchronously, and a later promise settlement pauses again if this
 * slot is still suppressed.
 */
export function cancelStudioMediaPlayback(media: object) {
  const slot = slotFor(media);
  slot.token += 1;
  slot.suppressResume = true;
  slot.pending = false;
  slot.blockedGeneration = null;
  slot.seekingTo = null;
}

function waitForStudioMediaSeek(
  media: StudioControllableMedia,
  target: number,
  isStale: () => boolean,
): Promise<"ready" | "stale" | "failed"> {
  if (isStale()) return Promise.resolve("stale");
  if (haveMetadata(media) && !media.seeking && near(media.currentTime, target)) {
    return Promise.resolve("ready");
  }
  const targetEvents = eventTarget(media);
  const addEventListener = targetEvents.addEventListener?.bind(targetEvents);
  const removeEventListener = targetEvents.removeEventListener?.bind(targetEvents);
  if (!addEventListener) {
    return Promise.resolve("failed");
  }
  return new Promise((resolve) => {
    let settled = false;
    const unlisten = () => {
      removeEventListener?.("seeked", onSeeked);
      removeEventListener?.("loadedmetadata", onMeta);
      removeEventListener?.("error", onError);
    };
    const finish = (result: "ready" | "stale" | "failed") => {
      if (settled) return;
      settled = true;
      unlisten();
      clearTimeout(timer);
      resolve(result);
    };
    const onSeeked = () => {
      if (isStale()) {
        finish("stale");
        return;
      }
      if (haveMetadata(media) && !media.seeking && near(media.currentTime, target)) {
        finish("ready");
        return;
      }
      if (!media.seeking && !near(media.currentTime, target)) {
        seekStudioMediaElementIfNeeded(media, target);
      }
    };
    const onMeta = () => {
      if (media.readyState >= 1 && !near(media.currentTime, target)) {
        seekStudioMediaElementIfNeeded(media, target);
      }
      if (
        haveMetadata(media) &&
        !media.seeking &&
        near(media.currentTime, target)
      ) {
        finish(isStale() ? "stale" : "ready");
      }
    };
    const onError = () => finish(isStale() ? "stale" : "failed");
    const timer = setTimeout(() => finish(isStale() ? "stale" : "failed"), SEEK_WAIT_TIMEOUT_MS);
    addEventListener("seeked", onSeeked);
    addEventListener("loadedmetadata", onMeta);
    addEventListener("error", onError);
  });
}

function guardPlaySettlement(
  media: StudioControllableMedia,
  promise: Promise<void>,
  isStale: () => boolean,
) {
  void promise.then(
    () => {
      if (isStale()) media.pause();
    },
    () => {
      if (isStale()) media.pause();
    },
  );
}

/**
 * Start `media` at `targetTime` for `generation`.
 * `play()` is invoked synchronously (before the first await) so a user
 * gesture is still consumed. Envelope opening stays with the caller and must
 * happen only when `started` is true.
 */
export async function beginStudioMediaPlayback(input: {
  media: StudioControllableMedia;
  generation: number;
  isGenerationCurrent: (generation: number) => boolean;
  targetTime: number | null;
}): Promise<StudioMediaPlayOutcome> {
  const media = input.media;
  bindMediaElement(media);
  const slot = slotFor(media);
  const myToken = slot.token + 1;
  slot.token = myToken;
  slot.suppressResume = false;
  slot.pending = true;
  slot.blockedGeneration = null;

  const before = Number.isFinite(media.currentTime) ? media.currentTime : 0;
  const target = input.targetTime;
  let playCalled = false;
  let playSettled: StudioMediaPlayOutcome["playSettled"] = "skipped";
  let errorName: string | null = null;

  const isStale = () => {
    const current = slotFor(media);
    return (
      current.token !== myToken ||
      current.suppressResume ||
      !input.isGenerationCurrent(input.generation)
    );
  };

  const finish = (
    partial: Pick<StudioMediaPlayOutcome, "started" | "stale"> & {
      playSettled?: StudioMediaPlayOutcome["playSettled"];
      errorName?: string | null;
    },
  ): StudioMediaPlayOutcome => {
    const current = slotFor(media);
    if (current.token === myToken) {
      current.pending = false;
      if (!partial.started && !partial.stale) {
        current.blockedGeneration = input.generation;
      }
    }
    const outcome: StudioMediaPlayOutcome = {
      generation: input.generation,
      playCalled,
      playSettled: partial.playSettled ?? playSettled,
      errorName: partial.errorName ?? errorName,
      currentTimeBeforeSeek: before,
      currentTimeAfterSettle: Number.isFinite(media.currentTime)
        ? media.currentTime
        : before,
      targetSeek: target,
      seeking: media.seeking,
      readyState: media.readyState,
      pausedAfterSettle: media.paused,
      started: partial.started,
      stale: partial.stale,
    };
    rememberOutcome(outcome);
    return outcome;
  };

  try {
    if (target != null) {
      seekStudioMediaElementIfNeeded(media, target);
    }

    const needsWait =
      target != null &&
      (media.seeking || !near(media.currentTime, target));

    if (media.paused) {
      playCalled = true;
      let playPromise: Promise<void>;
      try {
        playPromise = media.play();
      } catch (error) {
        playSettled = "rejected";
        errorName = studioMediaErrorName(error);
        media.pause();
        return finish({ started: false, stale: isStale(), playSettled, errorName });
      }
      guardPlaySettlement(media, playPromise, isStale);

      if (needsWait && target != null) {
        const waited = await waitForStudioMediaSeek(media, target, isStale);
        if (isStale() || waited === "stale") {
          media.pause();
          return finish({ started: false, stale: true, playSettled: "pending" });
        }
        if (waited === "failed") {
          errorName = errorName ?? "SeekFailed";
          playSettled = "rejected";
          media.pause();
          return finish({ started: false, stale: false, playSettled, errorName });
        }
      }

      if (isStale()) {
        media.pause();
        return finish({ started: false, stale: true, playSettled: "pending" });
      }

      try {
        await playPromise;
        playSettled = "resolved";
        errorName = null;
      } catch (error) {
        playSettled = "rejected";
        errorName = studioMediaErrorName(error);
        if (isStale()) {
          media.pause();
          return finish({ started: false, stale: true, playSettled, errorName });
        }
        try {
          playCalled = true;
          const retry = media.play();
          guardPlaySettlement(media, retry, isStale);
          await retry;
          playSettled = "resolved";
          errorName = null;
        } catch (retryError) {
          playSettled = "rejected";
          errorName = studioMediaErrorName(retryError);
          media.pause();
          return finish({ started: false, stale: false, playSettled, errorName });
        }
      }
    } else if (needsWait && target != null) {
      const waited = await waitForStudioMediaSeek(media, target, isStale);
      if (isStale() || waited === "stale") {
        media.pause();
        return finish({ started: false, stale: true });
      }
      if (waited === "failed") {
        errorName = "SeekFailed";
        media.pause();
        return finish({ started: false, stale: false, errorName, playSettled: "rejected" });
      }
    }

    if (isStale()) {
      media.pause();
      return finish({ started: false, stale: true });
    }

    const atTarget = target == null || near(media.currentTime, target);
    if (!atTarget || media.paused) {
      if (!atTarget) {
        errorName = errorName ?? "SeekFailed";
      }
      media.pause();
      return finish({
        started: false,
        stale: false,
        errorName,
        playSettled: media.paused && playCalled ? "rejected" : playSettled,
      });
    }

    return finish({ started: true, stale: false, playSettled, errorName });
  } catch (error) {
    if (isStale()) {
      media.pause();
      return finish({
        started: false,
        stale: true,
        errorName: studioMediaErrorName(error),
        playSettled: "rejected",
      });
    }
    media.pause();
    return finish({
      started: false,
      stale: false,
      errorName: studioMediaErrorName(error),
      playSettled: "rejected",
    });
  }
}

export function beginStudioCatalogPreviewPlay(
  media: StudioControllableMedia,
): Promise<void> {
  bindMediaElement(media);
  const slot = slotFor(media);
  const myToken = slot.token + 1;
  slot.token = myToken;
  slot.suppressResume = false;
  slot.pending = true;
  slot.blockedGeneration = null;

  let playPromise: Promise<void>;
  try {
    playPromise = media.play();
  } catch (error) {
    slot.pending = false;
    return Promise.reject(error);
  }

  return playPromise.then(
    () => {
      const current = slotFor(media);
      if (current.token === myToken) {
        current.pending = false;
      }
      if (current.token !== myToken || current.suppressResume) {
        media.pause();
      }
    },
    (error: unknown) => {
      const current = slotFor(media);
      if (current.token === myToken) {
        current.pending = false;
      }
      if (current.token !== myToken || current.suppressResume) {
        media.pause();
      }
      throw error;
    },
  );
}

export function stopStudioCatalogPreview(
  media: StudioControllableMedia | null | undefined,
) {
  if (!media) return;
  cancelStudioMediaPlayback(media);
  media.pause();
  media.removeAttribute?.("src");
  media.load?.();
}

export function redactStudioMediaSrc(src: string): string {
  const raw = typeof src === "string" ? src : "";
  const withoutQuery = raw.split("?")[0] ?? "";
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://audiolad.local");
    if (url.origin === "https://audiolad.local") {
      return withoutQuery;
    }
    return `${url.origin}${url.pathname}`;
  } catch {
    return withoutQuery;
  }
}

export function describeStudioAudioElement(input: {
  role: StudioAudioElementRole;
  trackId?: string | null;
  sourceType?: string | null;
  media: Pick<
    StudioControllableMedia,
    "src" | "paused" | "currentTime" | "readyState" | "networkState" | "seeking"
  >;
}): StudioAudioElementDiagnostic {
  return {
    role: input.role,
    trackId: input.trackId ?? null,
    sourceType: input.sourceType ?? null,
    src: redactStudioMediaSrc(input.media.src || ""),
    paused: Boolean(input.media.paused),
    currentTime: Number.isFinite(input.media.currentTime) ? input.media.currentTime : 0,
    readyState: input.media.readyState,
    networkState: input.media.networkState,
    seeking: Boolean(input.media.seeking),
  };
}

export function formatStudioPauseAudioDiagnostics(
  rows: readonly StudioAudioElementDiagnostic[],
): string {
  if (rows.length === 0) return "none";
  return rows
    .map((row) => {
      const who =
        row.role === "project-runtime"
          ? `project:${row.trackId ?? "?"}:${row.sourceType ?? "?"}`
          : "catalog-preview";
      return `${who} paused=${row.paused} t=${row.currentTime.toFixed(2)} seeking=${row.seeking} ready=${row.readyState} net=${row.networkState} src=${row.src}`;
    })
    .join(" | ");
}

export function publishStudioPauseDiagnostics(
  rows: readonly StudioAudioElementDiagnostic[],
) {
  lastPauseDiagnostics = rows;
  if (debugLogging) {
    console.info("[studio-playback] pause", rows);
  }
}

export function readStudioPauseDiagnostics(): readonly StudioAudioElementDiagnostic[] {
  return lastPauseDiagnostics;
}

export function listMountedStudioCatalogPreviewMedia(
  root: ParentNode | null | undefined,
): HTMLAudioElement[] {
  if (!root || typeof root.querySelectorAll !== "function") return [];
  return [
    ...root.querySelectorAll<HTMLAudioElement>(
      `audio[data-studio-audio-role="${STUDIO_CATALOG_PREVIEW_AUDIO_ROLE}"]`,
    ),
  ];
}

export function stopMountedStudioCatalogPreviews(
  root: ParentNode | null | undefined,
) {
  for (const media of listMountedStudioCatalogPreviewMedia(root)) {
    stopStudioCatalogPreview(media);
  }
}
