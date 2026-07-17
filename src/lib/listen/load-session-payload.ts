import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import { buildCoverDisplayUrl } from "@/lib/author-products/utils";
import { resolveListenAccess } from "@/lib/listen/access";
import type { LoadSessionInput } from "@/lib/listen/global-player-types";
import { listPracticeProgress } from "@/lib/listen/progress";
import {
  mapLegacyPracticeToListenTrack,
  mapRowToListenTrack,
} from "@/lib/listen/track-cover";
import type { ListenTrack } from "@/lib/listen/types";
import { resolveProductAccess } from "@/lib/products/access";
import {
  getPracticeAuthorSlug,
  type PublicPracticeRow,
} from "@/lib/products/lookup";

type PracticeRow = PublicPracticeRow & {
  use_shared_cover?: boolean | null;
};

type AudioItemRow = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  duration_seconds: number | null;
  audio_path: string | null;
  cover_url: string | null;
  updated_at: string | null;
  status: string;
};

const coverGradients = [
  "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
  "from-[#6f4bbb] via-[#8e68c9] to-[#d7b9ef]",
  "from-[#5f7f9b] via-[#7ea8c4] to-[#b9ddcf]",
  "from-[#8b6b3f] via-[#c9a56d] to-[#e4cfa8]",
  "from-[#4f5f9b] via-[#7a8fd4] to-[#b8c9ef]",
];

const slugSymbols: Record<string, string> = {
  "elixir-molodosti": "❀",
  "klyuch-k-izobiliyu": "⚿",
  "kod-prityazheniya": "✦",
  "personal-boundaries": "◯",
};

const fallbackSymbols = ["♡", "☼", "✧", "❈"];

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function stableHash(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getCoverGradient(slug: string): string {
  return coverGradients[stableHash(slug) % coverGradients.length];
}

function getCoverSymbol(slug: string): string {
  if (slugSymbols[slug]) {
    return slugSymbols[slug];
  }

  return fallbackSymbols[stableHash(slug) % fallbackSymbols.length];
}

function getAuthorName(authors: PracticeRow["authors"]): string {
  const author = normalizeOne(authors);
  const name = author?.name?.trim();

  return name || "Автор не указан";
}

async function loadListenTracks(
  supabase: SupabaseClient,
  practice: PracticeRow,
  accessMode: "entitled" | "author_preview",
): Promise<ListenTrack[]> {
  let query = supabase
    .from("audio_items")
    .select(
      "id, title, description, position, duration_seconds, audio_path, cover_url, updated_at, status",
    )
    .eq("practice_id", practice.id)
    .order("position", { ascending: true });

  if (accessMode === "entitled") {
    query = query.eq("status", "published");
  }

  const { data: audioItems, error } = await query;

  if (error) {
    throw new Error("audio_items_lookup_failed");
  }

  const practiceContext = {
    cover_url: practice.cover_url,
    updated_at: practice.updated_at,
    use_shared_cover: practice.use_shared_cover ?? true,
  };

  const tracks = ((audioItems ?? []) as AudioItemRow[])
    .filter((item) => item.audio_path?.trim())
    .map((item) => mapRowToListenTrack(item, practiceContext));

  if (tracks.length > 0) {
    return tracks;
  }

  const legacyPath =
    typeof practice.audio_url === "string" ? practice.audio_url.trim() : "";

  if (!legacyPath) {
    return [];
  }

  return [mapLegacyPracticeToListenTrack({
    id: practice.id,
    title: practice.title,
    description: practice.description,
    duration_minutes: practice.duration_minutes,
    cover_url: practice.cover_url,
    updated_at: practice.updated_at,
    use_shared_cover: practice.use_shared_cover ?? true,
  })];
}

export type LoadSessionPayloadResult =
  | { ok: true; session: LoadSessionInput }
  | { ok: false; reason: "not_found" | "unavailable" | "no_audio" | "error" };

/**
 * Load a listen session payload for Play All queue transitions.
 * Re-checks access. Does not include signed audio URLs.
 */
export async function loadListenSessionPayload(
  supabase: SupabaseClient,
  authorSlug: string,
  productSlug: string,
  userId: string | null,
  options?: { forceStartAtBeginning?: boolean },
): Promise<LoadSessionPayloadResult> {
  try {
    const { data: practice, error: practiceError } = await supabase
      .from("practices")
      .select(
        `
      id,
      author_id,
      title,
      slug,
      description,
      format,
      duration_minutes,
      audio_url,
      cover_url,
      use_shared_cover,
      updated_at,
      status,
      is_free,
      is_catalog_listed,
      authors!practices_author_id_fkey!inner (
        id,
        name,
        slug
      )
    `,
      )
      .eq("slug", productSlug)
      .eq("authors.slug", authorSlug)
      .maybeSingle();

    if (practiceError) {
      return { ok: false, reason: "error" };
    }

    if (!practice) {
      return { ok: false, reason: "not_found" };
    }

    const practiceRow = practice as PracticeRow;
    const resolvedAuthorSlug =
      getPracticeAuthorSlug(practiceRow) ?? authorSlug;

    const productAccess = await resolveProductAccess(
      supabase,
      practiceRow,
      userId,
    );

    if (!productAccess.canListen) {
      return { ok: false, reason: "unavailable" };
    }

    const access = await resolveListenAccess(supabase, userId, practiceRow);

    if (!access) {
      return { ok: false, reason: "unavailable" };
    }

    const tracks = await loadListenTracks(supabase, practiceRow, access.mode);

    if (tracks.length === 0) {
      return { ok: false, reason: "no_audio" };
    }

    let initialProgress: Awaited<ReturnType<typeof listPracticeProgress>> = [];

    if (userId && !options?.forceStartAtBeginning) {
      try {
        initialProgress = await listPracticeProgress(
          supabase,
          userId,
          practiceRow.id,
        );
      } catch {
        initialProgress = [];
      }
    }

    return {
      ok: true,
      session: {
        practiceId: practiceRow.id,
        authorSlug: resolvedAuthorSlug,
        productSlug: practiceRow.slug,
        practiceTitle: practiceRow.title,
        authorName: getAuthorName(practiceRow.authors),
        format: getDisplayFormat(practiceRow.format),
        tracks,
        initialProgress,
        coverSymbol: getCoverSymbol(practiceRow.slug),
        coverGradient: getCoverGradient(practiceRow.slug),
        coverImageUrl: buildCoverDisplayUrl(
          practiceRow.cover_url,
          practiceRow.updated_at,
        ),
        isAuthorPreview: access.mode === "author_preview",
        forceStartAtBeginning: options?.forceStartAtBeginning === true,
      },
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}
