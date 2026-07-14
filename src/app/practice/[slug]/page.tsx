import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import BottomNav from "@/components/BottomNav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type AccessSource =
  | "starter"
  | "free_claim"
  | "purchase"
  | "gift"
  | "subscription"
  | "program"
  | "admin";

type AuthorRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
};

type PracticeRow = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  audio_url: string | null;
  status: string | null;
  updated_at: string | null;
  authors: AuthorRow | AuthorRow[] | null;
};

type EntitlementRow = {
  access_source: AccessSource | string;
  expires_at: string | null;
};

type PracticeQueryResult = {
  practice: PracticeRow | null;
  error: boolean;
};

const coverGradients = [
  "from-[#f0d9ff] via-[#dec4ff] to-[#c9b6f4]",
  "from-[#ffe0ed] via-[#f4c7e3] to-[#d7b9ef]",
  "from-[#dff4eb] via-[#ccebdc] to-[#b9ddcf]",
  "from-[#fff0d2] via-[#f5dfbb] to-[#e4cfa8]",
  "from-[#e8f0ff] via-[#d4e2ff] to-[#b8c9ef]",
];

const slugSymbols: Record<string, string> = {
  "elixir-molodosti": "❀",
  "klyuch-k-izobiliyu": "⚿",
  "kod-prityazheniya": "✦",
  "personal-boundaries": "◯",
};

const fallbackSymbols = ["♡", "☼", "✧", "❈"];

const METADATA_DESCRIPTION_FALLBACK =
  "Аудиопрактика на платформе АудиоЛад.";
const PAGE_DESCRIPTION_FALLBACK = "Описание практики скоро появится.";

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

function buildCoverDisplayUrl(
  coverUrl: string | null,
  updatedAt: string | null,
): string | null {
  if (!coverUrl?.trim()) {
    return null;
  }

  const trimmed = coverUrl.trim();

  if (!updatedAt?.trim()) {
    return trimmed;
  }

  const separator = trimmed.includes("?") ? "&" : "?";

  return `${trimmed}${separator}v=${encodeURIComponent(updatedAt.trim())}`;
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

function getAccessBadgeLabel(accessSource: AccessSource | string): string {
  switch (accessSource) {
    case "starter":
      return "Стартовая практика";
    case "free_claim":
      return "Получено бесплатно";
    case "purchase":
      return "Куплено";
    case "gift":
      return "Подарок";
    case "subscription":
      return "По подписке";
    case "program":
      return "В программе";
    case "admin":
      return "Доступ открыт";
    default:
      return "Доступ открыт";
  }
}

function formatPracticeMeta(
  format: string | null | undefined,
  durationMinutes: number | null | undefined,
): string | null {
  const trimmedFormat = typeof format === "string" ? format.trim() : "";
  const duration =
    typeof durationMinutes === "number" &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0
      ? `${durationMinutes} мин`
      : "";

  if (trimmedFormat && duration) {
    return `${trimmedFormat} · ${duration}`;
  }

  if (trimmedFormat) {
    return trimmedFormat;
  }

  if (duration) {
    return duration;
  }

  return null;
}

function getAuthorName(practice: PracticeRow): string | null {
  const author = normalizeOne(practice.authors);
  const name = author?.name?.trim();

  return name ? name : null;
}

function getPracticeDescription(description: string | null): string {
  const trimmed = typeof description === "string" ? description.trim() : "";

  return trimmed || PAGE_DESCRIPTION_FALLBACK;
}

function formatPriceLabel(price: number | null, isFree: boolean | null): string {
  if (isFree === true) {
    return "Бесплатная практика";
  }

  if (
    typeof price === "number" &&
    Number.isFinite(price) &&
    price >= 0
  ) {
    return `${price} ₽`;
  }

  return "Стоимость уточняется";
}

function hasAudioReady(audioUrl: string | null | undefined): boolean {
  return typeof audioUrl === "string" && audioUrl.trim().length > 0;
}

function getAudioButtonLabel(audioUrl: string | null | undefined): string {
  if (hasAudioReady(audioUrl)) {
    return "Аудио готовится к запуску";
  }

  return "Аудио скоро появится";
}

function truncateDescription(text: string, maxLength = 160): string {
  const characters = [...text];

  if (characters.length <= maxLength) {
    return text;
  }

  return `${characters.slice(0, maxLength).join("").trimEnd()}…`;
}

function disabledButtonClasses(): string {
  return "disabled:cursor-not-allowed disabled:opacity-60";
}

async function getPracticeBySlug(slug: string): Promise<PracticeQueryResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("practices")
    .select(
      `
      id,
      title,
      slug,
      subtitle,
      description,
      format,
      duration_minutes,
      price,
      is_free,
      cover_url,
      audio_url,
      status,
      updated_at,
      authors (
        id,
        name,
        slug,
        description,
        avatar_url
      )
    `,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return { practice: null, error: true };
  }

  return {
    practice: (data as PracticeRow | null) ?? null,
    error: false,
  };
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function PracticeErrorState() {
  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-28 shadow-sm">
        <div className="px-5 pt-6">
          <Link
            href="/catalog"
            className="inline-flex items-center text-sm font-medium text-[#7042c5]"
          >
            ← Назад в каталог
          </Link>

          <section className="mt-10 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-8 text-center">
            <h1 className="text-[22px] font-semibold">
              Не удалось загрузить практику
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
              Попробуйте вернуться в каталог и открыть материал ещё раз.
            </p>
            <Link
              href="/catalog"
              className="mt-5 inline-flex rounded-[18px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
            >
              Вернуться в каталог
            </Link>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { practice, error } = await getPracticeBySlug(slug);

  if (error || !practice) {
    return {
      title: "Практика – АудиоЛад",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const trimmedDescription =
    typeof practice.description === "string"
      ? practice.description.trim()
      : "";

  return {
    title: `${practice.title} – АудиоЛад`,
    description: trimmedDescription
      ? truncateDescription(trimmedDescription)
      : METADATA_DESCRIPTION_FALLBACK,
    alternates: {
      canonical: `https://audiolad.ru/practice/${slug}`,
    },
  };
}

export default async function PracticePage({ params }: PageProps) {
  const { slug } = await params;
  const { practice, error } = await getPracticeBySlug(slug);

  if (error) {
    return <PracticeErrorState />;
  }

  if (!practice) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let activeEntitlement: EntitlementRow | null = null;

  if (user) {
    const { data: entitlement } = await supabase
      .from("user_practices")
      .select("access_source, expires_at")
      .eq("practice_id", practice.id)
      .maybeSingle();

    if (
      entitlement &&
      isAccessActive((entitlement as EntitlementRow).expires_at)
    ) {
      activeEntitlement = entitlement as EntitlementRow;
    }
  }

  const authorName = getAuthorName(practice);
  const meta = formatPracticeMeta(practice.format, practice.duration_minutes);
  const description = getPracticeDescription(practice.description);
  const gradient = getCoverGradient(practice.slug);
  const symbol = getCoverSymbol(practice.slug);
  const coverDisplayUrl = buildCoverDisplayUrl(
    practice.cover_url,
    practice.updated_at,
  );
  const subtitle = practice.subtitle?.trim() || null;
  const hasActiveAccess = activeEntitlement !== null;
  const primaryStatusLabel =
    activeEntitlement !== null
      ? getAccessBadgeLabel(activeEntitlement.access_source)
      : formatPriceLabel(practice.price, practice.is_free);
  const audioReady = hasAudioReady(practice.audio_url);
  const audioLabel = getAudioButtonLabel(practice.audio_url);
  const listenHref = `/listen/${practice.slug}`;

  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] pb-28 shadow-sm">
        <div className="px-5 pt-6">
          <Link
            href="/catalog"
            className="inline-flex items-center text-sm font-medium text-[#7042c5]"
          >
            ← Назад в каталог
          </Link>

          <section className="mt-6">
            <div
              className={`relative aspect-square overflow-hidden rounded-[32px] shadow-[0_22px_48px_rgba(99,61,163,0.22)] ${
                coverDisplayUrl ? "bg-[#f4ecfb]" : `bg-gradient-to-br ${gradient}`
              }`}
            >
              {coverDisplayUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverDisplayUrl}
                  alt={practice.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <>
                  <div className="absolute -left-12 -top-10 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
                  <div className="absolute -bottom-14 -right-12 h-60 w-60 rounded-full bg-[#f8d8c9]/30 blur-2xl" />

                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-40 w-40 items-center justify-center rounded-full border border-white/45 bg-white/10 text-[90px] text-white shadow-[0_0_50px_rgba(255,255,255,0.32)]">
                      {symbol}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="mt-6">
            <span className="inline-flex rounded-full bg-[#f4ecfb] px-4 py-2 text-xs font-semibold text-[#7042c5]">
              {primaryStatusLabel}
            </span>

            <h1 className="mt-4 text-[32px] font-semibold leading-[1.15]">
              {practice.title}
            </h1>

            {subtitle ? (
              <p className="mt-2 line-clamp-2 text-base leading-6 text-[#7d70a2]">
                {subtitle}
              </p>
            ) : null}

            {authorName && (
              <p className="mt-3 text-base font-medium text-[#7042c5]">
                {authorName}
              </p>
            )}

            {meta && (
              <p className="mt-3 text-sm text-[#7d70a2]">{meta}</p>
            )}
          </section>

          <section className="mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <p className="text-[15px] leading-7 text-[#65577f]">
              {description}
            </p>
          </section>

          <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] p-5">
            <p className="text-sm text-[#8a7ca9]">Статус доступа</p>

            {activeEntitlement !== null ? (
              <div className="mt-2">
                <p className="text-[18px] font-semibold text-[#7042c5]">
                  Доступ открыт
                </p>
                <p className="mt-1 text-sm text-[#7d70a2]">
                  {getAccessBadgeLabel(activeEntitlement.access_source)}
                </p>
              </div>
            ) : practice.is_free === true ? (
              <p className="mt-2 text-[18px] font-semibold text-[#7042c5]">
                Бесплатная практика
              </p>
            ) : (
              <p className="mt-2 text-[18px] font-semibold text-[#7042c5]">
                {formatPriceLabel(practice.price, practice.is_free)}
              </p>
            )}
          </section>

          <section className="mt-4">
            {audioReady ? (
              <Link
                href={listenHref}
                className="flex w-full items-center justify-center gap-3 rounded-[22px] border border-[#bca6df] bg-white px-5 py-4 font-semibold text-[#7042c5]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7042c5] text-white">
                  <PlayIcon />
                </span>
                Слушать
              </Link>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className={`flex w-full items-center justify-center gap-3 rounded-[22px] border border-[#bca6df] bg-white px-5 py-4 font-semibold text-[#7042c5] ${disabledButtonClasses()}`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7042c5] text-white opacity-70">
                  <PlayIcon />
                </span>
                {audioLabel}
              </button>
            )}
          </section>

          {!hasActiveAccess && (
            <section className="mt-4">
              {practice.is_free === true ? (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className={`w-full rounded-[22px] border border-[#e2d7f2] bg-[#faf6ff] px-5 py-4 text-sm font-semibold text-[#7d70a2] ${disabledButtonClasses()}`}
                >
                  Добавление в библиотеку скоро появится
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className={`w-full rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9974d8] px-5 py-4 text-sm font-semibold text-white opacity-80 ${disabledButtonClasses()}`}
                >
                  Покупка скоро появится
                </button>
              )}
            </section>
          )}

          <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white p-5">
            <h2 className="text-[17px] font-semibold">Перед прослушиванием</h2>
            <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
              Выберите спокойное и безопасное место для прослушивания. Не
              включайте практику во время управления транспортом или работы,
              требующей постоянной концентрации.
            </p>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
