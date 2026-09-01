import type { SupabaseClient } from "@supabase/supabase-js";

import { getDisplayFormat } from "@/lib/author-products/format";
import { resolvePublicationClass } from "@/lib/author-products/publication-class";
import { resolveProductCoverUrl } from "@/lib/images/resolve-display";
import { chooseCatalogPreviewAudioRow } from "@/lib/catalog/catalog-preview-audio-choice";
import {
  fromAudioPreviewWindowColumns,
  resolvePlaybackPreviewWindow,
} from "@/lib/listen/preview-window";
import {
  applyCatalogPlayContract,
} from "@/lib/catalog/catalog-playback-contract";
import type { CatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import { isCatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import { loadListenSessionPayload } from "@/lib/listen/load-session-payload";
import {
  mapLegacyPracticeToListenTrack,
  mapRowToListenTrack,
} from "@/lib/listen/track-cover";
import {
  isPracticeCatalogListed,
  isPracticePublished,
} from "@/lib/products/access";
import {
  getPracticeAuthorSlug,
  getPracticeByAuthorAndSlug,
  type PublicPracticeRow,
} from "@/lib/products/lookup";
import { buildPracticePublicPath } from "@/lib/products/paths";

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function getAuthorName(authors: PublicPracticeRow["authors"]): string {
  const author = normalizeOne(authors);
  const name = author?.name?.trim();
  return name || "Автор не указан";
}

type PreviewAudioRow = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  duration_seconds: number | null;
  audio_path: string | null;
  cover_url: string | null;
  cover_image?: unknown;
  updated_at: string | null;
  status: string;
  is_preview?: boolean | null;
  preview_start_ms?: number | null;
  preview_end_ms?: number | null;
};

async function loadCatalogPreviewSession(
  supabase: SupabaseClient,
  authorSlug: string,
  productSlug: string,
  audioItemId?: string | null,
): Promise<
  | { ok: true; session: CatalogGlobalPlayerSession }
  | { ok: false; reason: "not_found" | "unavailable" | "no_audio" | "error" }
> {
  const { practice, error } = await getPracticeByAuthorAndSlug(
    supabase,
    authorSlug,
    productSlug,
  );

  if (error) {
    return { ok: false, reason: "error" };
  }

  if (!practice) {
    return { ok: false, reason: "not_found" };
  }

  if (!isPracticePublished(practice.status) || !isPracticeCatalogListed(practice)) {
    return { ok: false, reason: "unavailable" };
  }

  const resolvedAuthorSlug = getPracticeAuthorSlug(practice) ?? authorSlug;
  const practiceContext = {
    cover_url: practice.cover_url,
    cover_image: practice.cover_image,
    updated_at: practice.updated_at,
    use_shared_cover: practice.use_shared_cover ?? true,
  };

  const { data: audioItems, error: audioError } = await supabase
    .from("audio_items")
    .select(
      "id, title, description, position, duration_seconds, audio_path, cover_url, cover_image, updated_at, status, is_preview, preview_start_ms, preview_end_ms",
    )
    .eq("practice_id", practice.id)
    .eq("status", "published")
    .order("position", { ascending: true });

  if (audioError) {
    return { ok: false, reason: "error" };
  }

  const rows = ((audioItems ?? []) as PreviewAudioRow[]).filter((item) =>
    Boolean(item.audio_path?.trim()),
  );

  const isCourse =
    resolvePublicationClass(practice.publication_class, practice.product_kind) ===
    "course";

  const chosenResult = chooseCatalogPreviewAudioRow(rows, {
    isCourse,
    audioItemId,
  });

  if (!chosenResult.ok) {
    return { ok: false, reason: "unavailable" };
  }

  const chosen = chosenResult.row;

  let track = chosen
    ? mapRowToListenTrack(chosen, practiceContext)
    : null;

  if (!track) {
    const legacyPath =
      typeof practice.audio_url === "string" ? practice.audio_url.trim() : "";

    if (!legacyPath) {
      return { ok: false, reason: "no_audio" };
    }

    track = mapLegacyPracticeToListenTrack({
      id: practice.id,
      title: practice.title,
      description: practice.description,
      duration_minutes: practice.duration_minutes,
      cover_url: practice.cover_url,
      cover_image: practice.cover_image,
      updated_at: practice.updated_at,
      use_shared_cover: practice.use_shared_cover ?? true,
    });
  }

  const previewWindow = resolvePlaybackPreviewWindow(
    fromAudioPreviewWindowColumns(chosen ?? null),
    track.durationSeconds != null ? track.durationSeconds * 1000 : null,
  );
  const href = buildPracticePublicPath(resolvedAuthorSlug, practice.slug);
  const price =
    typeof practice.price === "number" && Number.isFinite(practice.price)
      ? practice.price
      : 0;

  return {
    ok: true,
    session: applyCatalogPlayContract(
      {
        sourceType: "catalog",
        practiceId: practice.id,
        authorSlug: resolvedAuthorSlug,
        productSlug: practice.slug,
        practiceTitle: practice.title,
        authorName: getAuthorName(practice.authors),
        format: getDisplayFormat(practice.format),
        tracks: [track],
        initialProgress: [],
        coverSymbol: "▶",
        coverGradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
        coverImageUrl: resolveProductCoverUrl(
          {
            cover_url: practice.cover_url,
            cover_image: practice.cover_image,
            updated_at: practice.updated_at,
          },
          360,
          "lg",
        ),
        coverImage: practice.cover_image ?? null,
        coverUpdatedAt: practice.updated_at ?? null,
        isAuthorPreview: false,
        playbackNavigation: "inline_only",
      },
      {
        playbackMode: "preview",
        previewStartMs: previewWindow.startMs,
        previewEndMs: previewWindow.endMs,
        previewNeedsSetup: previewWindow.needsSetup,
        previewCta: {
          type: "buy",
          price,
          href,
        },
      },
    ),
  };
}

export async function loadCatalogPlaySession(
  supabase: SupabaseClient,
  authorSlug: string,
  productSlug: string,
  userId: string | null,
  options?: { audioItemId?: string | null },
): Promise<
  | { ok: true; session: CatalogGlobalPlayerSession }
  | { ok: false; reason: "not_found" | "unavailable" | "no_audio" | "error" }
> {
  const entitled = await loadListenSessionPayload(
    supabase,
    authorSlug,
    productSlug,
    userId,
    { forceStartAtBeginning: true },
  );

  if (entitled.ok) {
    if (!isCatalogGlobalPlayerSession(entitled.session)) {
      return { ok: false, reason: "error" };
    }

    return {
      ok: true,
      session: applyCatalogPlayContract(entitled.session),
    };
  }

  if (entitled.reason !== "unavailable") {
    return entitled;
  }

  return loadCatalogPreviewSession(
    supabase,
    authorSlug,
    productSlug,
    options?.audioItemId,
  );
}
