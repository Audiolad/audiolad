import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicAudioItem = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  durationSeconds: number | null;
};

type AudioItemRow = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  duration_seconds: number | null;
  status: string;
};

type LoadPublicAudioItemsInput = {
  practiceId: string;
  practiceStatus: string | null;
  authorPreview: boolean;
  entitledAccess?: boolean;
};

export async function loadPublicAudioItems(
  supabase: SupabaseClient,
  input: LoadPublicAudioItemsInput,
): Promise<PublicAudioItem[]> {
  let query = supabase
    .from("audio_items")
    .select("id, title, description, position, duration_seconds, status")
    .eq("practice_id", input.practiceId)
    .order("position", { ascending: true });

  if (!input.authorPreview && !input.entitledAccess) {
    if (input.practiceStatus !== "published") {
      return [];
    }

    query = query.eq("status", "published");
  } else if (!input.authorPreview) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("public_audio_items_lookup_failed");
  }

  return ((data ?? []) as AudioItemRow[]).map((item) => ({
    id: item.id,
    title: item.title.trim(),
    description:
      typeof item.description === "string" && item.description.trim()
        ? item.description.trim()
        : null,
    position: item.position,
    durationSeconds: item.duration_seconds,
  }));
}

export async function loadPublishedAudioSummaries(
  supabase: SupabaseClient,
  practiceIds: string[],
): Promise<
  Array<{
    practiceId: string;
    durationSeconds: number | null;
  }>
> {
  if (practiceIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("audio_items")
    .select("practice_id, duration_seconds")
    .in("practice_id", practiceIds)
    .eq("status", "published");

  if (error) {
    throw new Error("published_audio_summaries_lookup_failed");
  }

  return (data ?? []).map((row) => ({
    practiceId: row.practice_id as string,
    durationSeconds: row.duration_seconds as number | null,
  }));
}

export function groupAudioSummariesByPractice(
  summaries: ReadonlyArray<{
    practiceId: string;
    durationSeconds: number | null;
  }>,
): Map<string, { audioCount: number; totalDurationSeconds: number }> {
  const grouped = new Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >();

  for (const summary of summaries) {
    const current = grouped.get(summary.practiceId) ?? {
      audioCount: 0,
      totalDurationSeconds: 0,
    };

    current.audioCount += 1;
    current.totalDurationSeconds += summary.durationSeconds ?? 0;
    grouped.set(summary.practiceId, current);
  }

  return grouped;
}
