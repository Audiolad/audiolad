import Link from "next/link";

import LibraryPracticeMenu from "@/components/playlists/LibraryPracticeMenu";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { getDisplayFormat } from "@/lib/author-products/format";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import {
  buildListenPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";
import {
  LISTEN_AUTOPLAY_QUERY_PARAM,
  LISTEN_AUTOPLAY_QUERY_VALUE,
} from "@/lib/listen/autoplay-intent";
import {
  getGiftProductServiceLineLabel,
  PRODUCT_SERVICE_LINE_CLASS,
} from "@/lib/products/product-service-label";
import { isProductFree } from "@/lib/products/price-format";

export type LibraryCardItem = {
  id: string;
  accessSource: string;
  practice: {
    id: string;
    title: string;
    slug: string;
    format: string | null;
    durationMinutes: number | null;
    coverUrl: string | null;
    updatedAt: string | null;
    audioUrl: string | null;
    isFree: boolean | null;
    price: number | null;
    authorName: string | null;
    authorSlug: string | null;
  } | null;
};

type LibraryCardProps = {
  item: LibraryCardItem;
  index: number;
};

function formatPracticeMeta(
  format: string | null | undefined,
  durationMinutes: number | null | undefined,
  isFree: boolean | null | undefined,
  price: number | null | undefined,
): string | null {
  const trimmedFormat = isProductFree(isFree, price)
    ? ""
    : getDisplayFormat(format) ?? "";
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

function hasAudioReady(audioUrl: string | null | undefined): boolean {
  return typeof audioUrl === "string" && audioUrl.trim().length > 0;
}

function getAudioStatusLabel(audioUrl: string | null | undefined): string {
  if (hasAudioReady(audioUrl)) {
    return "Слушать";
  }

  return "Аудиоматериал готовится к публикации";
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

const focusRingClass =
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

export default function LibraryCard({ item, index }: LibraryCardProps) {
  const practice = item.practice;
  const isUnavailable = practice === null;
  const title = isUnavailable
    ? "Практика временно недоступна"
    : practice.title.trim();
  const meta = practice
    ? formatPracticeMeta(
        practice.format,
        practice.durationMinutes,
        practice.isFree,
        practice.price,
      )
    : null;
  const serviceLineLabel = practice
    ? getGiftProductServiceLineLabel(practice.isFree, practice.price)
    : null;
  const coverDisplayUrl = practice
    ? getProductCoverDisplayUrl(practice.coverUrl, practice.updatedAt)
    : null;
  const audioReady = hasAudioReady(practice?.audioUrl);
  const audioStatus = getAudioStatusLabel(practice?.audioUrl);
  const authorSlug = practice?.authorSlug ?? null;
  const productHref =
    practice?.slug && authorSlug
      ? buildPracticePublicPath(authorSlug, practice.slug)
      : null;
  const listenHref =
    practice?.slug && audioReady
      ? authorSlug
        ? buildListenPath(authorSlug, practice.slug, { autoplay: true })
        : `/listen/${practice.slug}?${LISTEN_AUTOPLAY_QUERY_PARAM}=${LISTEN_AUTOPLAY_QUERY_VALUE}`
      : null;
  return (
    <article className="relative flex gap-4 rounded-[24px] border border-[#eadff8] bg-white p-3 pb-14 shadow-[0_8px_22px_rgba(91,62,145,0.06)]">
      {productHref ? (
        <Link
          href={productHref}
          aria-label={`Открыть «${title}»`}
          className={`absolute inset-0 z-0 rounded-[24px] ${focusRingClass}`}
        />
      ) : null}

      <div className="pointer-events-none relative z-[1] aspect-square w-[116px] shrink-0 min-[390px]:w-[124px]">
        <ProductCoverThumbnail
          slug={practice?.slug ?? `library-item-${index}`}
          title={title}
          coverUrl={coverDisplayUrl}
          className="aspect-square h-full w-full rounded-[20px]"
        />
      </div>

      <div className="pointer-events-none relative z-[1] flex min-w-0 flex-1 flex-col">
        {serviceLineLabel ? (
          <p className={PRODUCT_SERVICE_LINE_CLASS}>{serviceLineLabel}</p>
        ) : null}

        <p
          className={`line-clamp-2 text-[17px] font-semibold leading-6 text-[#25135c] ${serviceLineLabel ? "mt-1" : ""}`}
        >
          {title}
        </p>

        {isUnavailable ? (
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            Материал временно скрыт автором или платформой.
          </p>
        ) : (
          <>
            {practice.authorName ? (
              <p className="mt-1 text-sm font-medium text-[#25135c]">
                {practice.authorName}
              </p>
            ) : null}

            {meta ? <p className="mt-1 text-sm text-[#7d70a2]">{meta}</p> : null}
          </>
        )}
      </div>

      <div className="absolute bottom-3 right-3 z-[2] flex items-center gap-1">
        {listenHref ? (
          <Link
            href={listenHref}
            aria-label={`Слушать «${title}»`}
            className={`flex items-center gap-2 font-medium text-[#7042c5] ${focusRingClass}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white">
              <PlayIcon />
            </span>
            {audioStatus}
          </Link>
        ) : (
          <span
            className="flex items-center gap-2 font-medium text-[#7042c5] opacity-70"
            aria-disabled="true"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white opacity-70">
              <PlayIcon />
            </span>
            {audioStatus}
          </span>
        )}

        {practice?.id ? (
          <LibraryPracticeMenu
            practiceId={practice.id}
            practiceTitle={title}
          />
        ) : null}
      </div>
    </article>
  );
}
