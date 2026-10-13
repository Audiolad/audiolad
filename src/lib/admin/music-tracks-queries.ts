import { createServiceRoleClient } from "@/lib/supabase/service-role";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export type AdminMusicTrackRow = {
  id: string;
  trackCode: string;
  title: string;
  position: number;
  artistId: string;
  artistName: string;
  artistSlug: string | null;
  productId: string;
  productTitle: string;
};

type PracticeRow = {
  id: string;
  title: string;
  author_id: string;
};

type AuthorRow = {
  id: string;
  name: string;
  slug: string | null;
};

type AudioRow = {
  id: string;
  practice_id: string;
  title: string;
  position: number;
  music_track_code: string | null;
};

const PAGE_SIZE = 1000;

/**
 * Max ids per PostgREST `in.(...)` filter. Ids go into the GET query string;
 * production gateway answers 502 once the URL passes ~4 KB (100 UUIDs failed,
 * 80 passed on 2026-10-13). 40 UUIDs keep the URL well under 2 KB.
 */
export const ADMIN_MUSIC_TRACKS_ID_CHUNK_SIZE = 40;

export function chunkIds<T>(
  ids: readonly T[],
  size = ADMIN_MUSIC_TRACKS_ID_CHUNK_SIZE,
): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("chunk_size_invalid");
  }
  const chunks: T[][] = [];
  for (let offset = 0; offset < ids.length; offset += size) {
    chunks.push(ids.slice(offset, offset + size));
  }
  return chunks;
}

async function loadAllMusicPractices(
  service: ServiceClient,
): Promise<PracticeRow[]> {
  const rows: PracticeRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await service
      .from("practices")
      .select("id, title, author_id")
      .eq("product_kind", "music")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error("admin_music_tracks_practices_load_failed");
    }

    const batch = (data ?? []) as PracticeRow[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function loadAuthors(
  service: ServiceClient,
  authorIds: string[],
): Promise<AuthorRow[]> {
  const rows: AuthorRow[] = [];

  for (const ids of chunkIds(authorIds)) {
    const { data, error } = await service
      .from("authors")
      .select("id, name, slug")
      .in("id", ids);

    if (error) {
      throw new Error("admin_music_tracks_authors_load_failed");
    }

    rows.push(...((data ?? []) as AuthorRow[]));
  }

  return rows;
}

async function loadAudioItems(
  service: ServiceClient,
  practiceIds: string[],
): Promise<AudioRow[]> {
  const rows: AudioRow[] = [];

  for (const ids of chunkIds(practiceIds)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await service
        .from("audio_items")
        .select("id, practice_id, title, position, music_track_code")
        .in("practice_id", ids)
        .order("practice_id", { ascending: true })
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error("admin_music_tracks_audio_load_failed");
      }

      const batch = (data ?? []) as AudioRow[];
      rows.push(...batch);

      if (batch.length < PAGE_SIZE) {
        break;
      }
    }
  }

  return rows;
}

export async function listAdminMusicTracks(
  service: ServiceClient = createServiceRoleClient(),
): Promise<AdminMusicTrackRow[]> {
  const practices = await loadAllMusicPractices(service);

  if (practices.length === 0) {
    return [];
  }

  const practiceById = new Map(
    practices.map((practice) => [practice.id, practice]),
  );
  const authorIds = [
    ...new Set(practices.map((practice) => practice.author_id)),
  ];
  const authors = await loadAuthors(service, authorIds);
  const authorById = new Map(authors.map((author) => [author.id, author]));
  const audioItems = await loadAudioItems(
    service,
    practices.map((practice) => practice.id),
  );

  return audioItems
    .filter(
      (item): item is AudioRow & { music_track_code: string } =>
        typeof item.music_track_code === "string" &&
        item.music_track_code.trim().length > 0,
    )
    .map((item) => {
      const practice = practiceById.get(item.practice_id);

      if (!practice) {
        return null;
      }

      const author = authorById.get(practice.author_id);

      return {
        id: item.id,
        trackCode: item.music_track_code.trim(),
        title: item.title?.trim() || "Без названия",
        position: item.position,
        artistId: practice.author_id,
        artistName: author?.name?.trim() || "Автор не найден",
        artistSlug: author?.slug?.trim() || null,
        productId: practice.id,
        productTitle: practice.title?.trim() || "Без названия",
      } satisfies AdminMusicTrackRow;
    })
    .filter((row): row is AdminMusicTrackRow => row !== null)
    .sort((left, right) => left.trackCode.localeCompare(right.trackCode, "ru"));
}
