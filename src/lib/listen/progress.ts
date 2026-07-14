import type { SupabaseClient } from "@supabase/supabase-js";

import type { ListenProgressEntry } from "./types";

const COMPLETION_THRESHOLD_SECONDS = 2;

type ProgressRow = {
  audio_item_id: string;
  position_seconds: number;
  completed: boolean;
};

export function isTrackCompleted(
  durationSeconds: number | null,
  positionSeconds: number,
  completed: boolean,
): boolean {
  if (completed) {
    return true;
  }

  if (
    typeof durationSeconds === "number" &&
    durationSeconds > 0 &&
    positionSeconds >= durationSeconds - COMPLETION_THRESHOLD_SECONDS
  ) {
    return true;
  }

  return false;
}

export function resolveInitialPlayback(
  tracks: Array<{ id: string; durationSeconds: number | null }>,
  progress: ListenProgressEntry[],
): {
  trackIndex: number;
  positionSeconds: number;
  allCompleted: boolean;
} {
  const progressMap = new Map(
    progress.map((entry) => [entry.audioItemId, entry]),
  );

  for (const [index, track] of tracks.entries()) {
    const entry = progressMap.get(track.id);
    const completed = entry
      ? isTrackCompleted(
          track.durationSeconds,
          entry.positionSeconds,
          entry.completed,
        )
      : false;

    if (!completed) {
      const positionSeconds = Math.max(0, entry?.positionSeconds ?? 0);
      const duration = track.durationSeconds ?? 0;

      if (duration > 0 && positionSeconds >= duration - COMPLETION_THRESHOLD_SECONDS) {
        continue;
      }

      return {
        trackIndex: index,
        positionSeconds,
        allCompleted: false,
      };
    }
  }

  return {
    trackIndex: Math.max(tracks.length - 1, 0),
    positionSeconds: 0,
    allCompleted: tracks.length > 0,
  };
}

export function calculateProgramProgressPercent(
  tracks: Array<{ id: string; durationSeconds: number | null }>,
  progress: ListenProgressEntry[],
  currentTrackId: string,
  currentTime: number,
): number {
  let totalSeconds = 0;
  let completedSeconds = 0;

  for (const track of tracks) {
    const duration = track.durationSeconds ?? 0;
    totalSeconds += duration;

    if (track.id === currentTrackId) {
      completedSeconds += Math.max(0, currentTime);
      break;
    }

    const entry = progress.find((item) => item.audioItemId === track.id);

    if (
      entry &&
      isTrackCompleted(track.durationSeconds, entry.positionSeconds, entry.completed)
    ) {
      completedSeconds += duration;
    } else {
      completedSeconds += Math.max(0, entry?.positionSeconds ?? 0);
    }
  }

  if (totalSeconds <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((completedSeconds / totalSeconds) * 100));
}

export async function listPracticeProgress(
  supabase: SupabaseClient,
  userId: string,
  practiceId: string,
): Promise<ListenProgressEntry[]> {
  const { data, error } = await supabase
    .from("practice_audio_progress")
    .select("audio_item_id, position_seconds, completed")
    .eq("user_id", userId)
    .eq("practice_id", practiceId);

  if (error) {
    throw new Error("progress_list_failed");
  }

  return ((data ?? []) as ProgressRow[]).map((row) => ({
    audioItemId: row.audio_item_id,
    positionSeconds: row.position_seconds,
    completed: row.completed,
  }));
}

export async function upsertPracticeProgress(
  supabase: SupabaseClient,
  userId: string,
  practiceId: string,
  audioItemId: string,
  positionSeconds: number,
  completed: boolean,
): Promise<void> {
  const { error } = await supabase.from("practice_audio_progress").upsert(
    {
      user_id: userId,
      practice_id: practiceId,
      audio_item_id: audioItemId,
      position_seconds: Math.max(0, Math.floor(positionSeconds)),
      completed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,practice_id,audio_item_id" },
  );

  if (error) {
    throw new Error("progress_upsert_failed");
  }
}

export async function resetPracticeProgress(
  supabase: SupabaseClient,
  userId: string,
  practiceId: string,
): Promise<void> {
  const { error } = await supabase
    .from("practice_audio_progress")
    .delete()
    .eq("user_id", userId)
    .eq("practice_id", practiceId);

  if (error) {
    throw new Error("progress_reset_failed");
  }
}
