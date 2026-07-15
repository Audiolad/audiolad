import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import AudioPlayer from "@/components/audio/AudioPlayer";
import BottomNav from "@/components/BottomNav";
import { buildCoverDisplayUrl } from "@/lib/author-products/utils";
import { resolveListenAccess } from "@/lib/listen/access";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";
import { listPracticeProgress } from "@/lib/listen/progress";
import type { ListenTrack } from "@/lib/listen/types";
import {
  resolveProductAccess,
} from "@/lib/products/access";
import {
  getPracticeAuthorSlug,
  type PublicPracticeRow,
} from "@/lib/products/lookup";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { createClient } from "@/lib/supabase/server";

type PracticeRow = PublicPracticeRow;


type AudioItemRow = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  duration_seconds: number | null;
  audio_path: string | null;
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

function ListenShell({
  children,
  backHref,
  backLabel,
}: {
  children: ReactNode;
  backHref: string;
  backLabel: string;
}) {
  return (
    <main className="min-h-dvh bg-[#24133f] text-white">
      <div
        className={`relative mx-auto min-h-dvh w-full max-w-[480px] overflow-hidden bg-gradient-to-b from-[#6f4bbb] via-[#8e68c9] to-[#2b1749] px-5 pt-[max(1.25rem,env(safe-area-inset-top,0px))] motion-reduce:transition-none ${platformNavPaddingClass}`}
      >
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#e5b5df]/20 blur-3xl motion-reduce:blur-none" />
        <div className="pointer-events-none absolute -right-24 bottom-20 h-72 w-72 rounded-full bg-[#e9c3b5]/15 blur-3xl motion-reduce:blur-none" />

        <header className="relative z-10">
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center text-sm font-medium text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {backLabel}
          </Link>
        </header>

        <div className="relative z-10">{children}</div>
      </div>

      <BottomNav />
    </main>
  );
}

function ListenMessageState({
  title,
  description,
  backHref,
  backLabel,
}: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <ListenShell backHref={backHref} backLabel={backLabel}>
      <section className="mt-16 rounded-[28px] border border-white/12 bg-white/8 px-6 py-8 text-center">
        <h1 className="text-[24px] font-semibold leading-tight">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-white/70">{description}</p>
        <Link
          href={backHref}
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {backLabel}
        </Link>
      </section>
    </ListenShell>
  );
}

async function loadListenTracks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  practice: PracticeRow,
  accessMode: "entitled" | "author_preview",
): Promise<ListenTrack[]> {
  let query = supabase
    .from("audio_items")
    .select(
      "id, title, description, position, duration_seconds, audio_path, status",
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

  const tracks = ((audioItems ?? []) as AudioItemRow[])
    .filter((item) => item.audio_path?.trim())
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      position: item.position,
      durationSeconds: item.duration_seconds,
    }));

  if (tracks.length > 0) {
    return tracks;
  }

  const legacyPath =
    typeof practice.audio_url === "string" ? practice.audio_url.trim() : "";

  if (!legacyPath) {
    return [];
  }

  return [
    {
      id: `legacy-${practice.id}`,
      title: practice.title,
      description: practice.description,
      position: 1,
      durationSeconds:
        typeof practice.duration_minutes === "number" &&
        practice.duration_minutes > 0
          ? Math.round(practice.duration_minutes * 60)
          : null,
    },
  ];
}

export async function renderListenPage(
  authorSlug: string,
  productSlug: string,
  options?: { accessDenied?: boolean },
) {
  const practiceHref = buildPracticePublicPath(authorSlug, productSlug);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      updated_at,
      status,
      is_free,
      is_catalog_listed,
      authors!inner (
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
    return (
      <ListenMessageState
        title="Не удалось загрузить практику"
        description="Попробуйте вернуться в каталог и открыть материал ещё раз."
        backHref="/catalog"
        backLabel="Вернуться в каталог"
      />
    );
  }

  if (!practice) {
    notFound();
  }

  const practiceRow = practice as PracticeRow;
  const resolvedAuthorSlug = getPracticeAuthorSlug(practiceRow) ?? authorSlug;

  let productAccess;

  try {
    productAccess = await resolveProductAccess(
      supabase,
      practiceRow,
      user?.id ?? null,
    );
  } catch {
    return (
      <ListenMessageState
        title="Не удалось проверить доступ"
        description="Попробуйте открыть практику ещё раз."
        backHref={practiceHref}
        backLabel="К странице практики"
      />
    );
  }

  if (!productAccess.canListen || options?.accessDenied) {
    const deniedHref = `${practiceHref}?listen=required`;
    return (
      <ListenMessageState
        title="Доступ к прослушиванию не открыт"
        description="Для прослушивания необходимо приобрести доступ."
        backHref={deniedHref}
        backLabel="К странице практики"
      />
    );
  }

  let access;

  try {
    access = await resolveListenAccess(
      supabase,
      user?.id ?? null,
      practiceRow,
    );
  } catch {
    return (
      <ListenMessageState
        title="Не удалось проверить доступ"
        description="Попробуйте открыть практику ещё раз."
        backHref={practiceHref}
        backLabel="К странице практики"
      />
    );
  }

  if (!access) {
    redirect(`${practiceHref}?listen=required`);
  }

  let tracks: ListenTrack[] = [];

  try {
    tracks = await loadListenTracks(supabase, practiceRow, access.mode);
  } catch {
    return (
      <ListenMessageState
        title="Не удалось загрузить аудио"
        description="Попробуйте открыть страницу ещё раз через несколько секунд."
        backHref={practiceHref}
        backLabel="К странице практики"
      />
    );
  }

  if (tracks.length === 0) {
    return (
      <ListenMessageState
        title="Аудио пока недоступно"
        description="Файлы практики ещё не подготовлены к прослушиванию."
        backHref={practiceHref}
        backLabel="Вернуться к практике"
      />
    );
  }

  let initialProgress: Awaited<ReturnType<typeof listPracticeProgress>> = [];

  if (user) {
    try {
      initialProgress = await listPracticeProgress(
        supabase,
        user.id,
        practiceRow.id,
      );
    } catch {
      initialProgress = [];
    }
  }

  const authorName = getAuthorName(practiceRow.authors);
  const coverGradient = getCoverGradient(practiceRow.slug);
  const coverSymbol = getCoverSymbol(practiceRow.slug);
  const coverImageUrl = buildCoverDisplayUrl(
    practiceRow.cover_url,
    practiceRow.updated_at,
  );
  const trimmedFormat =
    typeof practiceRow.format === "string" ? practiceRow.format.trim() : null;

  return (
    <ListenShell backHref={practiceHref} backLabel="← К практике">
      <div className="mt-4 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-white/60">
          Сейчас играет
        </p>
      </div>

      <AudioPlayer
        practiceId={practiceRow.id}
        authorSlug={resolvedAuthorSlug}
        productSlug={practiceRow.slug}
        practiceTitle={practiceRow.title}
        authorName={authorName}
        format={trimmedFormat}
        tracks={tracks}
        initialProgress={initialProgress}
        coverSymbol={coverSymbol}
        coverGradient={coverGradient}
        coverImageUrl={coverImageUrl}
        isAuthorPreview={access.mode === "author_preview"}
      />
    </ListenShell>
  );
}
