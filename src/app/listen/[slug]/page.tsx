import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import AudioPlayer from "@/components/audio/AudioPlayer";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type AuthorRow = {
  id: string;
  name: string;
  slug: string;
};

type PracticeRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  audio_url: string | null;
  status: string | null;
  authors: AuthorRow | AuthorRow[] | null;
};

type EntitlementRow = {
  access_source: string;
  expires_at: string | null;
};

const APP_ORIGIN = "https://audiolad.ru";

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

function isAccessActive(expiresAt: string | null): boolean {
  if (expiresAt === null) {
    return true;
  }

  const expiresDate = new Date(expiresAt);

  if (Number.isNaN(expiresDate.getTime())) {
    return false;
  }

  return expiresDate > new Date();
}

function isValidPracticeAudioPath(path: string, practiceId: string): boolean {
  const trimmed = path.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("/")) {
    return false;
  }

  if (trimmed.includes("?")) {
    return false;
  }

  if (trimmed.includes("..")) {
    return false;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return false;
  }

  const segments = trimmed.split("/");

  if (segments.length < 3) {
    return false;
  }

  if (segments[0] !== "practices") {
    return false;
  }

  if (segments[1] !== practiceId) {
    return false;
  }

  if (!segments[2]?.trim()) {
    return false;
  }

  return true;
}

function normalizeStorageSignedUrl(signedUrl: string): string | null {
  const trimmed = signedUrl.trim();

  if (!trimmed) {
    return null;
  }

  let pathAndQuery = trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);

      if (url.origin !== APP_ORIGIN) {
        return null;
      }

      pathAndQuery = `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }

  if (pathAndQuery.startsWith("/storage/v1/")) {
    return `${APP_ORIGIN}${pathAndQuery}`;
  }

  if (pathAndQuery.startsWith("/object/sign/")) {
    return `${APP_ORIGIN}/storage/v1${pathAndQuery}`;
  }

  if (pathAndQuery.startsWith("object/sign/")) {
    return `${APP_ORIGIN}/storage/v1/${pathAndQuery}`;
  }

  return null;
}

function getAuthorName(authors: PracticeRow["authors"]): string {
  const author = normalizeOne(authors);
  const name = author?.name?.trim();

  return name || "Автор не указан";
}

function getExpectedDurationSeconds(
  durationMinutes: number | null | undefined,
): number | null {
  if (
    typeof durationMinutes === "number" &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0
  ) {
    return Math.round(durationMinutes * 60);
  }

  return null;
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
    <main className="min-h-screen bg-[#24133f] text-white">
      <div className="relative mx-auto min-h-screen w-full max-w-[480px] overflow-hidden bg-gradient-to-b from-[#6f4bbb] via-[#8e68c9] to-[#2b1749] px-5 pb-10 pt-5 motion-reduce:transition-none">
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

export default async function ListenPage({ params }: PageProps) {
  const { slug } = await params;
  const practiceHref = `/practice/${slug}`;
  const signInHref = `/auth/sign-in?${new URLSearchParams({
    next: `/listen/${slug}`,
  }).toString()}`;

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(signInHref);
  }

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select(
      `
      id,
      title,
      slug,
      description,
      format,
      duration_minutes,
      audio_url,
      status,
      authors (
        id,
        name,
        slug
      )
    `,
    )
    .eq("slug", slug)
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
  const audioPath =
    typeof practiceRow.audio_url === "string" ? practiceRow.audio_url.trim() : "";

  if (!audioPath || !isValidPracticeAudioPath(audioPath, practiceRow.id)) {
    return (
      <ListenMessageState
        title="Аудио пока недоступно"
        description="Файл практики ещё не подготовлен к прослушиванию."
        backHref={practiceHref}
        backLabel="Вернуться к практике"
      />
    );
  }

  const { data: entitlement, error: entitlementError } = await supabase
    .from("user_practices")
    .select("access_source, expires_at")
    .eq("practice_id", practiceRow.id)
    .maybeSingle();

  if (entitlementError) {
    return (
      <ListenMessageState
        title="Не удалось проверить доступ"
        description="Попробуйте открыть практику ещё раз."
        backHref={practiceHref}
        backLabel="К странице практики"
      />
    );
  }

  const entitlementRow = entitlement as EntitlementRow | null;

  if (!entitlementRow || !isAccessActive(entitlementRow.expires_at)) {
    return (
      <ListenMessageState
        title="Доступ к прослушиванию не открыт"
        description="Откройте страницу практики, чтобы посмотреть доступные варианты."
        backHref={practiceHref}
        backLabel="К странице практики"
      />
    );
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from("practice-audio")
    .createSignedUrl(audioPath, 3600);

  if (signedError || !signedData?.signedUrl) {
    return (
      <ListenMessageState
        title="Не удалось подготовить аудио"
        description="Попробуйте открыть страницу ещё раз через несколько секунд."
        backHref={practiceHref}
        backLabel="К странице практики"
      />
    );
  }

  const normalizedSignedUrl = normalizeStorageSignedUrl(signedData.signedUrl);

  if (!normalizedSignedUrl) {
    return (
      <ListenMessageState
        title="Не удалось подготовить аудио"
        description="Попробуйте открыть страницу ещё раз через несколько секунд."
        backHref={practiceHref}
        backLabel="К странице практики"
      />
    );
  }

  const authorName = getAuthorName(practiceRow.authors);
  const coverGradient = getCoverGradient(practiceRow.slug);
  const coverSymbol = getCoverSymbol(practiceRow.slug);
  const expectedDurationSeconds = getExpectedDurationSeconds(
    practiceRow.duration_minutes,
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
        src={normalizedSignedUrl}
        title={practiceRow.title}
        authorName={authorName}
        slug={practiceRow.slug}
        format={trimmedFormat}
        expectedDurationSeconds={expectedDurationSeconds}
        coverSymbol={coverSymbol}
        coverGradient={coverGradient}
      />
    </ListenShell>
  );
}
