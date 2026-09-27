import { createServiceRoleClient } from "@/lib/supabase/service-role";

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

async function loadAllMusicPractices(): Promise<PracticeRow[]> {
  const service = createServiceRoleClient();
  const rows: PracticeRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await service
      .from("practices")
      .select("id, title, author_id")
      .eq("product_kind", "music")
      .is("deleted_at", null)
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

async function loadAuthors(authorIds: string[]): Promise<AuthorRow[]> {
  if (authorIds.length === 0) {
    return [];
  }

  const service = createServiceRoleClient();
  const rows: AuthorRow[] = [];

  for (let offset = 0; offset < authorIds.length; offset += PAGE_SIZE) {
    const ids = authorIds.slice(offset, offset + PAGE_SIZE);
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

async function loadAudioItems(practiceIds: string[]): Promise<AudioRow[]> {
  if (practiceIds.length === 0) {
    return [];
  }

  const service = createServiceRoleClient();
  const rows: AudioRow[] = [];

  for (let offset = 0; offset < practiceIds.length; offset += PAGE_SIZE) {
    const ids = practiceIds.slice(offset, offset + PAGE_SIZE);

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await service
        .from("audio_items")
        .select("id, practice_id, title, position, music_track_code")
        .in("practice_id", ids)
        .order("practice_id", { ascending: true })
        .order("position", { ascending: true })
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

export async function listAdminMusicTracks(): Promise<AdminMusicTrackRow[]> {
  const practices = await loadAllMusicPractices();

  if (practices.length === 0) {
    return [];
  }

  const practiceById = new Map(
    practices.map((practice) => [practice.id, practice]),
  );
  const authorIds = [
    ...new Set(practices.map((practice) => practice.author_id)),
  ];
  const authors = await loadAuthors(authorIds);
  const authorById = new Map(authors.map((author) => [author.id, author]));
  const audioItems = await loadAudioItems(
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
    .sort((left, right) =>
      left.trackCode.localeCompare(right.trackCode, "ru"),
    );
}
