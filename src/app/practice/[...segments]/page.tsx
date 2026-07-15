import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";

import BottomNav from "@/components/BottomNav";
import BuyPracticeButton from "@/components/BuyPracticeButton";
import LibraryAddButton from "@/components/LibraryAddButton";
import LegalFooter from "@/components/LegalFooter";
import ProductContentsSection from "@/components/products/ProductContentsSection";
import { isPaymentsConfigured } from "@/lib/payments/is-configured";
import { formatProductMeta, sumDurationSeconds } from "@/lib/products/duration";
import {
  buildPracticeAccessPresentation,
  canUseBuyerPreviewMode,
} from "@/lib/products/practice-access-ui";
import { resolveProductAccess } from "@/lib/products/access";
import {
  getPracticeAuthorSlug,
  getPracticeByAuthorAndSlug,
  resolveLegacyPracticePath,
  type PublicPracticeRow,
} from "@/lib/products/lookup";
import {
  buildAuthorPublicPath,
  buildPracticeCanonicalUrl,
  buildPracticePublicPath,
} from "@/lib/products/paths";
import { loadPublicAudioItems } from "@/lib/products/public-audio-items";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ listen?: string; preview?: string }>;
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

function getAuthorName(practice: PublicPracticeRow): string | null {
  const author = normalizeOne(practice.authors);
  const name = author?.name?.trim();

  return name ? name : null;
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

function toolbarActionClassName(kind: "primary" | "secondary"): string {
  if (kind === "primary") {
    return "inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[#7042c5] px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";
  }

  return "inline-flex min-h-11 items-center justify-center rounded-[16px] border border-[#bda6e1] bg-white px-4 py-2.5 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";
}

function AuthorPreviewToolbar({
  message,
  actions,
}: {
  message: string | null;
  actions: Array<{
    kind: "buyer_preview" | "author_listen" | "edit";
    href: string;
    label: string;
    disabled?: boolean;
  }>;
}) {
  return (
    <section className="mt-4 rounded-[20px] border border-[#d9c8f4] bg-[#f8f3ff] px-4 py-4">
      <p className="text-sm font-semibold text-[#5f3f9d]">
        Предпросмотр для автора
      </p>
      {message ? (
        <p className="mt-1 text-sm leading-6 text-[#7d70a2]">{message}</p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2">
        {actions.map((action) =>
          action.disabled ? (
            <button
              key={action.label}
              type="button"
              disabled
              aria-disabled="true"
              className={`${toolbarActionClassName("secondary")} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {action.label}
            </button>
          ) : (
            <Link
              key={action.label}
              href={action.href}
              className={toolbarActionClassName(
                action.kind === "author_listen" ? "primary" : "secondary",
              )}
            >
              {action.label}
            </Link>
          ),
        )}
      </div>
    </section>
  );
}

function BuyerPreviewBanner({
  authorModeHref,
  actions,
}: {
  authorModeHref: string;
  actions: Array<{
    kind: "buyer_preview" | "author_listen" | "edit";
    href: string;
    label: string;
    disabled?: boolean;
  }>;
}) {
  return (
    <section className="mt-4 rounded-[20px] border border-dashed border-[#c9b6e8] bg-[#fcf8ff] px-4 py-4">
      <p className="text-sm font-semibold text-[#5f3f9d]">
        Предпросмотр глазами покупателя
      </p>
      <p className="mt-1 text-sm leading-6 text-[#7d70a2]">
        Так страницу увидит пользователь без доступа к продукту.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Link href={authorModeHref} className={toolbarActionClassName("secondary")}>
          Вернуться в режим автора
        </Link>
        {actions.map((action) =>
          action.disabled ? (
            <button
              key={action.label}
              type="button"
              disabled
              aria-disabled="true"
              className={`${toolbarActionClassName("primary")} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {action.label}
            </button>
          ) : (
            <Link
              key={action.label}
              href={action.href}
              className={toolbarActionClassName("primary")}
            >
              {action.label}
            </Link>
          ),
        )}
      </div>
    </section>
  );
}

function PaymentLegalNote() {
  const linkClassName =
    "text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

  return (
    <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
      Нажимая кнопку оплаты, вы соглашаетесь с условиями{" "}
      <Link href="/offer" className={linkClassName}>
        публичной оферты
      </Link>{" "}
      и{" "}
      <Link href="/payment-and-refund" className={linkClassName}>
        правилами оплаты и возврата
      </Link>
      .
    </p>
  );
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
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
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

async function resolvePracticeRoute(segments: string[]) {
  if (segments.length === 2) {
    return {
      authorSlug: segments[0],
      productSlug: segments[1],
    };
  }

  if (segments.length === 1) {
    const supabase = await createClient();

    const resolved = await resolveLegacyPracticePath(supabase, segments[0]);

    if (!resolved) {
      return null;
    }

    permanentRedirect(
      buildPracticePublicPath(resolved.authorSlug, resolved.productSlug),
    );
  }

  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { segments } = await params;

  if (segments.length === 1) {
    const supabase = await createClient();

    try {
      const resolved = await resolveLegacyPracticePath(supabase, segments[0]);

      if (!resolved) {
        return {
          robots: { index: false, follow: false },
        };
      }

      return {
        alternates: {
          canonical: buildPracticeCanonicalUrl(
            resolved.authorSlug,
            resolved.productSlug,
          ),
        },
        robots: { index: false, follow: true },
      };
    } catch {
      return {
        robots: { index: false, follow: false },
      };
    }
  }

  if (segments.length !== 2) {
    return {
      title: "Практика – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const [authorSlug, productSlug] = segments;
  const supabase = await createClient();
  const { practice, error } = await getPracticeByAuthorAndSlug(
    supabase,
    authorSlug,
    productSlug,
  );

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
      canonical: buildPracticeCanonicalUrl(authorSlug, productSlug),
    },
    openGraph: {
      url: buildPracticeCanonicalUrl(authorSlug, productSlug),
    },
  };
}

export default async function PracticePage({ params, searchParams }: PageProps) {
  const { segments } = await params;
  const { listen: listenParam, preview: previewParam } = await searchParams;
  const route = await resolvePracticeRoute(segments);

  if (!route) {
    notFound();
  }

  const { authorSlug, productSlug } = route;
  const supabase = await createClient();
  const { practice, error } = await getPracticeByAuthorAndSlug(
    supabase,
    authorSlug,
    productSlug,
  );

  if (error) {
    return <PracticeErrorState />;
  }

  if (!practice) {
    notFound();
  }

  const resolvedAuthorSlug = getPracticeAuthorSlug(practice) ?? authorSlug;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let access;

  try {
    access = await resolveProductAccess(supabase, practice, user?.id ?? null);
  } catch {
    return <PracticeErrorState />;
  }

  const authorPreview =
    access.reason === "author_owner" && practice.status !== "published";

  let publicAudioItems: Awaited<ReturnType<typeof loadPublicAudioItems>> = [];

  try {
    publicAudioItems = await loadPublicAudioItems(supabase, {
      practiceId: practice.id,
      practiceStatus: practice.status,
      authorPreview,
      entitledAccess:
        access.canListen &&
        !authorPreview &&
        practice.status !== "published",
    });
  } catch {
    return <PracticeErrorState />;
  }

  const buyerPreviewMode =
    previewParam === "buyer" && canUseBuyerPreviewMode(access);
  const practicePagePath = buildPracticePublicPath(
    resolvedAuthorSlug,
    practice.slug,
  );

  const presentation = buildPracticeAccessPresentation({
    access,
    practice,
    authorSlug: resolvedAuthorSlug,
    paymentsConfigured: isPaymentsConfigured(),
    isAuthenticated: Boolean(user),
    buyerPreviewMode,
  });

  const totalDurationSeconds = sumDurationSeconds(publicAudioItems);
  const authorName = getAuthorName(practice);
  const meta = formatProductMeta({
    format: practice.format,
    audioCount: publicAudioItems.length,
    totalDurationSeconds,
    durationMinutesFallback: practice.duration_minutes,
  });
  const description = practice.description?.trim() || null;
  const gradient = getCoverGradient(practice.slug);
  const symbol = getCoverSymbol(practice.slug);
  const coverDisplayUrl = buildCoverDisplayUrl(
    practice.cover_url,
    practice.updated_at,
  );
  const subtitle = practice.subtitle?.trim() || null;
  const authorPublicPath = buildAuthorPublicPath(resolvedAuthorSlug);
  const listenDeniedMessage =
    listenParam === "required"
      ? "Для прослушивания необходимо приобрести доступ."
      : null;

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-6">
          <Link
            href="/catalog"
            className="inline-flex items-center text-sm font-medium text-[#7042c5]"
          >
            ← Назад в каталог
          </Link>

          {presentation.showBuyerPreviewBanner ? (
            <BuyerPreviewBanner
              authorModeHref={practicePagePath}
              actions={presentation.authorToolbarActions}
            />
          ) : null}

          {presentation.showAuthorToolbar ? (
            <AuthorPreviewToolbar
              message={presentation.authorToolbarMessage}
              actions={presentation.authorToolbarActions}
            />
          ) : null}

          {presentation.showAdminPreview ? (
            <section className="mt-4 rounded-[20px] border border-[#d9c8f4] bg-[#f8f3ff] px-4 py-4">
              <p className="text-sm font-semibold text-[#5f3f9d]">
                Технический просмотр
              </p>
              <p className="mt-1 text-sm leading-6 text-[#7d70a2]">
                Доступ открыт для сотрудника платформы
              </p>
            </section>
          ) : null}

          {listenDeniedMessage ? (
            <section className="mt-4 rounded-[20px] border border-[#f2d4d8] bg-[#fff7f8] px-4 py-4">
              <p className="text-sm leading-6 text-[#8d4d57]">
                {listenDeniedMessage}
              </p>
            </section>
          ) : null}

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
              {presentation.statusBadge}
            </span>

            {presentation.statusDetail ? (
              <p className="mt-2 text-sm text-[#7d70a2]">
                {presentation.statusDetail}
              </p>
            ) : null}

            <h1 className="mt-4 text-[32px] font-semibold leading-[1.15]">
              {practice.title}
            </h1>

            {subtitle ? (
              <p className="mt-2 line-clamp-3 text-base leading-6 text-[#7d70a2]">
                {subtitle}
              </p>
            ) : null}

            {authorName ? (
              <Link
                href={authorPublicPath}
                className="mt-3 inline-flex min-h-11 items-center text-base font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                aria-label={`Страница автора ${authorName}`}
              >
                {authorName}
              </Link>
            ) : null}

            {meta && (
              <p className="mt-3 text-sm text-[#7d70a2]">{meta}</p>
            )}
          </section>

          {description ? (
            <section className="mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
              <p className="whitespace-pre-line text-[15px] leading-7 text-[#65577f]">
                {description}
              </p>
            </section>
          ) : null}

          <ProductContentsSection
            items={publicAudioItems}
            durationMinutesFallback={practice.duration_minutes}
            productTitle={practice.title}
          />

          <section className="mt-6">
            {presentation.primaryAction.kind === "listen" ? (
              <Link
                href={presentation.primaryAction.href}
                className="flex w-full items-center justify-center gap-3 rounded-[22px] border border-[#bca6df] bg-white px-5 py-4 font-semibold text-[#7042c5]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7042c5] text-white">
                  <PlayIcon />
                </span>
                {presentation.primaryAction.label}
              </Link>
            ) : presentation.primaryAction.kind === "buy" ? (
              presentation.primaryAction.disabled ? (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className={`w-full rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9974d8] px-5 py-4 text-sm font-semibold text-white opacity-80 ${disabledButtonClasses()}`}
                >
                  {presentation.primaryAction.label}
                </button>
              ) : (
                <>
                  <BuyPracticeButton
                    practiceSlug={presentation.primaryAction.practiceSlug}
                    label={presentation.primaryAction.label}
                    className="w-full rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9974d8] px-5 py-4 text-sm font-semibold text-white"
                    signInReturnPath={practicePagePath}
                  />
                  {presentation.showPaymentLegalNote ? <PaymentLegalNote /> : null}
                </>
              )
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
                {presentation.primaryAction.label}
              </button>
            )}
          </section>

          {presentation.libraryAction !== "hidden" ? (
            <section className="mt-4">
              <LibraryAddButton
                practiceSlug={practice.slug}
                signInReturnPath={practicePagePath}
                action={presentation.libraryAction}
                className={`w-full rounded-[22px] border border-[#e2d7f2] bg-[#faf6ff] px-5 py-4 text-sm font-semibold text-[#7d70a2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-80 ${disabledButtonClasses()}`}
              />
            </section>
          ) : null}

          <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white p-5">
            <h2 className="text-[17px] font-semibold">Перед прослушиванием</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#7d70a2]">
              {`Выберите спокойное и безопасное место для прослушивания.\n\nНе включайте практику во время управления транспортом или работы, требующей постоянной концентрации.`}
            </p>
          </section>
        </div>

        <div className="px-5 pb-6">
          <LegalFooter className="mt-8" />
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
