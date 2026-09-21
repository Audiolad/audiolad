export const STUDIO_MEDIA_DRIFT_SEEK_SECONDS = 0.25;

export type StudioMediaClipWindow = {
  startTime: number;
  offset: number;
  duration: number;
};

export function getStudioClipMediaTime(
  clip: StudioMediaClipWindow,
  timelineTime: number,
): number {
  const startTime = Number.isFinite(clip.startTime) && clip.startTime > 0 ? clip.startTime : 0;
  const offset = Number.isFinite(clip.offset) && clip.offset > 0 ? clip.offset : 0;
  const duration = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 0;
  const elapsed = Math.min(Math.max(timelineTime - startTime, 0), duration);
  return offset + elapsed;
}

export function findActiveStudioClip<T extends StudioMediaClipWindow>(
  clips: readonly T[],
  timelineTime: number,
): T | null {
  for (const clip of clips) {
    const startTime = Number.isFinite(clip.startTime) && clip.startTime > 0 ? clip.startTime : 0;
    const duration = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 0;
    if (timelineTime >= startTime && timelineTime < startTime + duration) {
      return clip;
    }
  }
  return null;
}

export function findNextStudioClip<T extends StudioMediaClipWindow>(
  clips: readonly T[],
  timelineTime: number,
): T | null {
  let next: T | null = null;
  for (const clip of clips) {
    const startTime = Number.isFinite(clip.startTime) && clip.startTime > 0 ? clip.startTime : 0;
    if (startTime <= timelineTime) continue;
    if (!next || startTime < next.startTime) {
      next = clip;
    }
  }
  return next;
}

export function shouldCorrectStudioMediaDrift(
  actualMediaTime: number,
  targetMediaTime: number,
  thresholdSeconds = STUDIO_MEDIA_DRIFT_SEEK_SECONDS,
): boolean {
  if (!Number.isFinite(actualMediaTime) || !Number.isFinite(targetMediaTime)) {
    return true;
  }
  return Math.abs(actualMediaTime - targetMediaTime) > thresholdSeconds;
}

export type StudioMediaElementSyncPlan = {
  activeClipId: string | null;
  envelope: "silence" | "clip";
  seekTo: number | null;
  loop: boolean;
  wantPlaying: boolean;
  enteredClip: boolean;
  elapsedClipTime: number;
};

function clipIdOf(clip: StudioMediaClipWindow & { id?: string }): string {
  return typeof clip.id === "string" && clip.id ? clip.id : "clip";
}

/**
 * One MediaElement per track. During a timeline gap we keep the element
 * playing (silenced) so a later clip does not need a new user gesture.
 *
 * While the transport is paused we only park the media clock at the mapped
 * source time and keep the envelope closed. Arming `activeClipId` / opening
 * the envelope on paused seeks made the next Play take the non-enter path
 * (`enteredClip: false`) and skip envelope rebuild — audible as missing
 * tracks until an unrelated UI seek re-entered the clip.
 */
export function planStudioMediaElementSync({
  clips,
  timelineTime,
  playing,
  activeClipId,
  mediaCurrentTime,
  mediaEnded = false,
  forceEnter = false,
}: {
  clips: readonly (StudioMediaClipWindow & { id?: string })[];
  timelineTime: number;
  playing: boolean;
  activeClipId: string | null;
  mediaCurrentTime: number;
  mediaEnded?: boolean;
  /** When true, treat the clip as a fresh enter even if activeClipId matches. */
  forceEnter?: boolean;
}): StudioMediaElementSyncPlan {
  const clip = findActiveStudioClip(clips, timelineTime);
  if (!clip) {
    return {
      activeClipId: null,
      envelope: "silence",
      seekTo: playing && mediaEnded ? 0 : null,
      loop: playing,
      wantPlaying: playing,
      enteredClip: false,
      elapsedClipTime: 0,
    };
  }

  const startTime =
    Number.isFinite(clip.startTime) && clip.startTime > 0 ? clip.startTime : 0;
  const mediaTime = getStudioClipMediaTime(clip, timelineTime);
  const clipId = clipIdOf(clip);
  const elapsedClipTime = Math.max(timelineTime - startTime, 0);

  // Paused transport: park media for buffering, never arm envelope/activeClip.
  if (!playing) {
    return {
      activeClipId: null,
      envelope: "silence",
      // Always park at the mapped source time so Play does not inherit a stale
      // media clock. Envelope/activeClip stay disarmed until a playing enter.
      seekTo: mediaTime,
      loop: false,
      wantPlaying: false,
      enteredClip: false,
      elapsedClipTime,
    };
  }

  const entered = forceEnter || activeClipId !== clipId;
  const shouldSeek =
    entered || shouldCorrectStudioMediaDrift(mediaCurrentTime, mediaTime);
  return {
    activeClipId: clipId,
    envelope: "clip",
    seekTo: shouldSeek ? mediaTime : null,
    loop: false,
    wantPlaying: true,
    enteredClip: entered,
    elapsedClipTime,
  };
}

/**
 * Bump a transport generation and decide whether a deferred callback may still
 * mutate playback. Stale generations must not pause, seek, or open envelopes
 * for a newer Play/seek restart.
 */
export function nextStudioPlaybackGeneration(current: number): number {
  const safe = Number.isFinite(current) && current >= 0 ? Math.floor(current) : 0;
  return safe + 1;
}

export function isStudioPlaybackGenerationCurrent(
  expected: number,
  current: number,
): boolean {
  return expected === current;
}

/**
 * Which tracks should audibly start for a playhead position. Selection and
 * zoom are intentionally not inputs — only unmuted tracks whose clips cover
 * the playhead.
 */
export function listStudioTracksAudibleAtPlayhead<
  TTrack extends {
    id: string;
    muted?: boolean;
    clips: readonly (StudioMediaClipWindow & { id?: string })[];
  },
>(tracks: readonly TTrack[], timelineTime: number): string[] {
  const audible: string[] = [];
  for (const track of tracks) {
    if (track.muted) continue;
    if (findActiveStudioClip(track.clips, timelineTime)) {
      audible.push(track.id);
    }
  }
  return audible;
}

export function countActiveStudioClips<T extends StudioMediaClipWindow>(
  clips: readonly T[],
  timelineTime: number,
): number {
  let count = 0;
  for (const clip of clips) {
    const startTime =
      Number.isFinite(clip.startTime) && clip.startTime > 0 ? clip.startTime : 0;
    const duration =
      Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 0;
    if (timelineTime >= startTime && timelineTime < startTime + duration) {
      count += 1;
    }
  }
  return count;
}

/**
 * Mirrors `StudioAudioProvider.startSourcesAtPosition` planning for one track:
 * clear any stale `activeClipId`, then `planStudioMediaElementSync(..., forceEnter: true)`.
 * Selection / zoom are intentionally absent — they must not affect this plan.
 */
export function planStudioProviderPlayRestart(input: {
  clips: readonly (StudioMediaClipWindow & { id?: string })[];
  timelineTime: number;
  /** Stale arm left over from an older bug or raced sync; ignored via forceEnter. */
  staleActiveClipId: string | null;
  mediaCurrentTime: number;
  mediaEnded?: boolean;
}): StudioMediaElementSyncPlan {
  return planStudioMediaElementSync({
    clips: input.clips,
    timelineTime: input.timelineTime,
    playing: true,
    // Provider clears runtime.activeClipId to null before sync; pass null here too.
    activeClipId: null,
    mediaCurrentTime: input.mediaCurrentTime,
    mediaEnded: input.mediaEnded,
    forceEnter: true,
  });
}

/**
 * Full Pause → paused seeks → Play restart for several tracks, matching the
 * provider call sequence (stopSources disarm → seek(playing=false) park →
 * startSourcesAtPosition forceEnter). Used by regression tests to lock the
 * production transport path without mounting React.
 */
export function planStudioProviderPauseSeekPlayCycle(input: {
  tracks: readonly {
    id: string;
    muted?: boolean;
    clips: readonly (StudioMediaClipWindow & { id?: string })[];
    /** Clip id that was active while playing before pause. */
    activeClipIdBeforePause: string | null;
    mediaCurrentTimeBeforePause: number;
  }[];
  pausedSeekTimes: readonly number[];
  playAt: number;
}): {
  afterPause: { trackId: string; activeClipId: null }[];
  afterPausedSeeks: {
    seekTime: number;
    tracks: {
      trackId: string;
      plan: StudioMediaElementSyncPlan;
      mediaCurrentTime: number;
    }[];
  }[];
  afterPlay: {
    trackId: string;
    plan: StudioMediaElementSyncPlan;
    expectedSourceOffset: number;
  }[];
} {
  const afterPause = input.tracks.map((track) => ({
    trackId: track.id,
    activeClipId: null as null,
  }));

  const mediaByTrack = new Map(
    input.tracks.map((track) => [track.id, track.mediaCurrentTimeBeforePause]),
  );

  const afterPausedSeeks: {
    seekTime: number;
    tracks: {
      trackId: string;
      plan: StudioMediaElementSyncPlan;
      mediaCurrentTime: number;
    }[];
  }[] = [];

  for (const seekTime of input.pausedSeekTimes) {
    const stepTracks = input.tracks.map((track) => {
      const plan = planStudioMediaElementSync({
        clips: track.clips,
        timelineTime: seekTime,
        playing: false,
        activeClipId: null,
        mediaCurrentTime: mediaByTrack.get(track.id) ?? 0,
      });
      const nextMedia =
        plan.seekTo != null ? plan.seekTo : (mediaByTrack.get(track.id) ?? 0);
      mediaByTrack.set(track.id, nextMedia);
      return {
        trackId: track.id,
        plan,
        mediaCurrentTime: nextMedia,
      };
    });
    afterPausedSeeks.push({ seekTime, tracks: stepTracks });
  }

  const afterPlay = input.tracks.map((track) => {
    const clip = findActiveStudioClip(track.clips, input.playAt);
    const expectedSourceOffset = clip
      ? getStudioClipMediaTime(clip, input.playAt)
      : 0;
    const plan = planStudioProviderPlayRestart({
      clips: track.clips,
      timelineTime: input.playAt,
      // Even if a stale id somehow survived, restart ignores it.
      staleActiveClipId: track.activeClipIdBeforePause,
      mediaCurrentTime: mediaByTrack.get(track.id) ?? 0,
    });
    return {
      trackId: track.id,
      plan,
      expectedSourceOffset,
    };
  });

  return { afterPause, afterPausedSeeks, afterPlay };
}

