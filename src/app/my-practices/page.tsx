import BottomNav from "@/components/BottomNav";
import LibraryPracticeMenu from "@/components/playlists/LibraryPracticeMenu";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { getDisplayFormat } from "@/lib/author-products/format";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { buildListenPath } from "@/lib/products/paths";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

export const dynamic = "force-dynamic";

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
  avatar_url: string | null;
};

type PracticeRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  updated_at: string | null;
  audio_url: string | null;
  status: string | null;
  authors: AuthorRow | AuthorRow[] | null;
};

type LibraryRow = {
  id: string;
  access_source: AccessSource | string;
  granted_at: string;
  expires_at: string | null;
  practices: PracticeRow | PracticeRow[] | null;
};

type ActiveLibraryItem = {
  id: string;
  accessSource: AccessSource | string;
  practice: PracticeRow | null;
};

const filterLabels = [
  "Все",
  "Купленные",
  "Бесплатные",
  "Скачанные",
  "Программы",
];

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function isAccessActive(expiresAt: string | null): boolean {
  if (expiresAt === null) {
    return true;
  }

  return new Date(expiresAt) > new Date();
}

function formatPracticesCount(count: number): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  let word = "практик";

  if (mod10 === 1 && mod100 !== 11) {
    word = "практика";
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = "практики";
  }

  return `${count} ${word}`;
}

function formatPracticeMeta(
  format: string | null | undefined,
  durationMinutes: number | null | undefined,
): string | null {
  const trimmedFormat = getDisplayFormat(format) ?? "";
  const duration =
    typeof durationMinutes === "number" && durationMinutes > 0
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

function getAuthorName(practice: PracticeRow | null): string | null {
  if (!practice) {
    return null;
  }

  const author = normalizeOne(practice.authors);
  const name = author?.name?.trim();

  return name ? name : null;
}

function hasAudioReady(audioUrl: string | null | undefined): boolean {
  return typeof audioUrl === "string" && audioUrl.trim().length > 0;
}

function getAudioStatusLabel(audioUrl: string | null | undefined): string {
  if (hasAudioReady(audioUrl)) {
    return "Слушать";
  }

  return "Аудиоматериал готовится к публикации";
}

function mapActiveLibraryItems(rows: LibraryRow[] | null): ActiveLibraryItem[] {
  if (!rows) {
    return [];
  }

  return rows
    .filter((row) => isAccessActive(row.expires_at))
    .map((row) => ({
      id: row.id,
      accessSource: row.access_source,
      practice: normalizeOne(row.practices),
    }));
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <circle
        cx="11"
        cy="11"
        r="7"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m16.5 16.5 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function DisabledControlClasses(isPrimary = false): string {
  return [
    "disabled:cursor-not-allowed disabled:opacity-60",
    isPrimary ? "disabled:hover:bg-[#7042c5]" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

type LibraryCardProps = {
  item: ActiveLibraryItem;
  index: number;
};

function getAuthorSlug(practice: PracticeRow | null): string | null {
  const author = normalizeOne(practice?.authors ?? null);
  const slug = author?.slug?.trim();

  return slug || null;
}

function LibraryCard({ item, index }: LibraryCardProps) {
  const practice = item.practice;
  const isUnavailable = practice === null;
  const title = isUnavailable
    ? "Практика временно недоступна"
    : practice.title.trim();
  const authorName = getAuthorName(practice);
  const meta = practice
    ? formatPracticeMeta(practice.format, practice.duration_minutes)
    : null;
  const coverDisplayUrl = practice
    ? getProductCoverDisplayUrl(practice.cover_url, practice.updated_at)
    : null;
  const audioReady = hasAudioReady(practice?.audio_url);
  const audioStatus = getAudioStatusLabel(practice?.audio_url);
  const authorSlug = getAuthorSlug(practice);
  const listenHref =
    practice?.slug && audioReady
      ? authorSlug
        ? buildListenPath(authorSlug, practice.slug, { autoplay: true })
        : `/listen/${practice.slug}`
      : null;

  return (
    <article className="flex gap-4 rounded-[24px] border border-[#eadff8] bg-white p-3 shadow-[0_8px_22px_rgba(91,62,145,0.06)]">
      <div className="aspect-square w-[116px] shrink-0 min-[390px]:w-[124px]">
        <ProductCoverThumbnail
          slug={practice?.slug ?? `library-item-${index}`}
          title={title}
          coverUrl={coverDisplayUrl}
          className="aspect-square h-full w-full rounded-[20px]"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-[17px] font-semibold leading-6">
          {title}
        </p>

        {isUnavailable ? (
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            Материал временно скрыт автором или платформой.
          </p>
        ) : (
          <>
            {authorName && (
              <p className="mt-1 text-sm font-medium text-[#25135c]">
                {authorName}
              </p>
            )}

            {meta && <p className="mt-1 text-sm text-[#7d70a2]">{meta}</p>}
          </>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          {listenHref ? (
            <Link
              href={listenHref}
              className="flex items-center gap-2 font-medium text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white">
                <PlayIcon />
              </span>
              {audioStatus}
            </Link>
          ) : (
            <button
              type="button"
              disabled
              aria-disabled="true"
              className={`flex items-center gap-2 font-medium text-[#7042c5] ${DisabledControlClasses()}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white opacity-70">
                <PlayIcon />
              </span>
              {audioStatus}
            </button>
          )}

          {practice?.id ? (
            <LibraryPracticeMenu
              practiceId={practice.id}
              practiceTitle={title}
            />
          ) : (
            <button
              type="button"
              disabled
              aria-disabled="true"
              aria-label="Дополнительное меню"
              className={`px-2 text-2xl leading-none text-[#8f82ad] ${DisabledControlClasses()}`}
            >
              ···
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default async function MyPracticesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: libraryRows, error } = await supabase
    .from("user_practices")
    .select(
      `
      id,
      access_source,
      granted_at,
      expires_at,
      practices (
        id,
        title,
        slug,
        description,
        format,
        duration_minutes,
        price,
        is_free,
        cover_url,
        updated_at,
        audio_url,
        status,
        authors (
          id,
          name,
          slug,
          avatar_url
        )
      )
    `,
    )
    .order("granted_at", { ascending: false });

  const activeItems = mapActiveLibraryItems(
    (libraryRows as LibraryRow[] | null) ?? null,
  );

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-semibold">Аудиотека</h1>
              <p className="mt-1 text-sm text-[#7d70a2]">
                Ваши бесплатные и купленные материалы
              </p>
            </div>

            <button
              type="button"
              disabled
              aria-disabled="true"
              aria-label="Поиск"
              className={`flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5] ${DisabledControlClasses()}`}
            >
              <SearchIcon />
            </button>
          </header>

          <div className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-2">
            {filterLabels.map((item, index) => (
              <button
                key={item}
                type="button"
                disabled
                aria-disabled="true"
                className={`shrink-0 rounded-full border px-4 py-2 text-sm ${DisabledControlClasses(
                  index === 0,
                )} ${
                  index === 0
                    ? "border-[#7042c5] bg-[#7042c5] text-white"
                    : "border-[#e2d7f2] bg-white text-[#25135c] opacity-70"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#7d70a2]">
                В библиотеке: {formatPracticesCount(activeItems.length)}
              </p>

              <button
                type="button"
                disabled
                aria-disabled="true"
                className={`text-sm font-medium text-[#7042c5] ${DisabledControlClasses()}`}
              >
                Сначала новые⌄
              </button>
            </div>

            {error ? (
              <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
                <p className="text-[17px] font-semibold">
                  Не удалось загрузить библиотеку
                </p>
                <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
                  Попробуйте обновить страницу.
                </p>
                <Link
                  href="/my-practices"
                  className="mt-4 inline-block text-sm font-medium text-[#7042c5]"
                >
                  Обновить
                </Link>
              </div>
            ) : activeItems.length === 0 ? (
              <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
                <p className="text-[17px] font-semibold">
                  В вашей библиотеке пока нет практик
                </p>
                <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
                  Выберите бесплатную практику или найдите подходящий материал в
                  каталоге.
                </p>
                <Link
                  href="/catalog"
                  className="mt-4 inline-block rounded-[18px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
                >
                  Перейти в каталог
                </Link>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {activeItems.map((item, index) => (
                  <LibraryCard key={item.id} item={item} index={index} />
                ))}
              </div>
            )}
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
