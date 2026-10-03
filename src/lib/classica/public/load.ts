import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClassicaPublicImage, ClassicaPublicWork } from "@/lib/classica/public/metadata";
import { classicaPublicStorageUrl } from "@/lib/classica/public/paths";

type PublicRow = Record<string, unknown>;

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapImages(value: unknown, supabaseUrl: string | undefined): ClassicaPublicImage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as Record<string, unknown>;
    const url = classicaPublicStorageUrl(
      typeof record.path === "string" ? record.path : null,
      supabaseUrl,
    );
    if (!url) {
      return [];
    }
    return [
      {
        url,
        alt: textOrNull(record.alt),
        title: textOrNull(record.title),
      },
    ];
  });
}

export function mapClassicaPublicWork(row: PublicRow, supabaseUrl: string | undefined): ClassicaPublicWork {
  const faq = Array.isArray(row.faq)
    ? row.faq.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const record = item as Record<string, unknown>;
        if (typeof record.question !== "string" || typeof record.answer !== "string") {
          return [];
        }
        return [{ question: record.question, answer: record.answer }];
      })
    : [];

  return {
    id: String(row.id),
    composerSlug: String(row.composer_slug ?? ""),
    workSlug: String(row.work_slug ?? ""),
    composerName: String(row.composer_name ?? ""),
    title: String(row.title ?? ""),
    heading: String(row.heading ?? row.title ?? ""),
    subtitle: textOrNull(row.subtitle),
    shortDescription: textOrNull(row.short_description),
    body: String(row.body ?? ""),
    aboutWork: textOrNull(row.about_work),
    aboutComposer: textOrNull(row.about_composer),
    listeningNotes: textOrNull(row.listening_notes),
    faq,
    extraBlocks: Array.isArray(row.extra_blocks)
      ? row.extra_blocks.flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }
          const record = item as Record<string, unknown>;
          if (typeof record.heading !== "string" || typeof record.body !== "string") {
            return [];
          }
          return [{ heading: record.heading, body: record.body }];
        })
      : [],
    seoTitle: String(row.seo_title ?? ""),
    seoDescription: String(row.seo_description ?? ""),
    musicalKey: textOrNull(row.musical_key),
    catalogueNumber: textOrNull(row.catalogue_number),
    compositionYear: typeof row.composition_year === "number" ? row.composition_year : null,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    audioUrl: classicaPublicStorageUrl(
      typeof row.audio_path === "string" ? row.audio_path : null,
      supabaseUrl,
    ),
    coverUrl: classicaPublicStorageUrl(
      typeof row.cover_path === "string" ? row.cover_path : null,
      supabaseUrl,
    ),
    coverAlt: textOrNull(row.title),
    images: mapImages(row.images, supabaseUrl),
    publishedAt: String(row.published_at ?? ""),
  };
}

export async function listPublishedClassicaWorks(
  supabase: SupabaseClient,
): Promise<ClassicaPublicWork[]> {
  const { data, error } = await supabase
    .from("classica_public_works")
    .select("*")
    .order("composer_name", { ascending: true })
    .order("title", { ascending: true });
  if (error) {
    console.error("[classica] public list failed");
    return [];
  }
  return ((data ?? []) as PublicRow[]).map((row) =>
    mapClassicaPublicWork(row, process.env.NEXT_PUBLIC_SUPABASE_URL),
  );
}

export async function getPublishedClassicaWork(
  supabase: SupabaseClient,
  composerSlug: string,
  workSlug: string,
): Promise<{ work: ClassicaPublicWork; related: ClassicaPublicWork[] } | null> {
  const { data, error } = await supabase
    .from("classica_public_works")
    .select("*")
    .eq("composer_slug", composerSlug)
    .eq("work_slug", workSlug)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const work = mapClassicaPublicWork(data as PublicRow, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const { data: relatedRows } = await supabase
    .from("classica_public_works")
    .select("*")
    .eq("composer_slug", composerSlug)
    .neq("id", work.id)
    .order("title", { ascending: true })
    .limit(6);
  const related = ((relatedRows ?? []) as PublicRow[]).map((row) =>
    mapClassicaPublicWork(row, process.env.NEXT_PUBLIC_SUPABASE_URL),
  );
  return { work, related };
}

export async function getPublishedClassicaAudioPath(
  supabase: SupabaseClient,
  publicId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("classica_public_works")
    .select("audio_path")
    .eq("id", publicId)
    .maybeSingle();
  if (error || !data?.audio_path) {
    return null;
  }
  return String(data.audio_path);
}
