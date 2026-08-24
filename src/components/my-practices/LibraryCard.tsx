"use client";

import Link from "next/link";

import AuthorLink from "@/components/authors/AuthorLink";
import BuyPracticeButton from "@/components/BuyPracticeButton";
import LibraryPracticeMenu from "@/components/playlists/LibraryPracticeMenu";
import CatalogProductHeartButton from "@/components/products/CatalogProductHeartButton";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import {
  getDisplayFormat,
  PRODUCT_FORMAT_LINE_CLASS,
} from "@/lib/author-products/format";
import type { CatalogListingItem } from "@/lib/catalog/listing-contract";
import {
  canShowLibraryPaidSaveOffer,
  canUseLibraryFullListen,
  resolveLibraryCardBadge,
} from "@/lib/library/card-ui";
import {
  formatPracticePrice,
  getProductPriceLabel,
  isProductFree,
} from "@/lib/products/price-format";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { BUY_ACTION_LABEL, PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";

import LibraryCardPlayButton from "./LibraryCardPlayButton";
import LibraryCardPreviewPlayButton from "./LibraryCardPreviewPlayButton";

export type LibraryCardItem = {
  id: string;
  practiceId: string;
  isSaved: boolean;
  canListen: boolean;
  accessSource: string | null;
  /** When the practice was added to the library (for All-tab merge sort). */
  grantedAt?: string | null;
  practice: {
    id: string;
    title: string;
    slug: string;
    format: string | null;
    durationMinutes: number | null;
    coverUrl: string | null;
    coverImage?: unknown;
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
  highlighted?: boolean;
  leaving?: boolean;
  isAuthenticated?: boolean;
  signInReturnPath?: string;
  onRemovedFromLibrary?: (practiceId: string) => void;
};

function formatPracticeDuration(
  durationMinutes: number | null | undefined,
): string | null {
  if (typeof durationMinutes === "number" && durationMinutes > 0) {
    return `${durationMinutes} мин`;
  }

  return null;
}

function hasAudioReady(audioUrl: string | null | undefined): boolean {
  return typeof audioUrl === "string" && audioUrl.trim().length > 0;
}

function getAudioStatusLabel(audioUrl: string | null | undefined): string {
  if (hasAudioReady(audioUrl)) {
    return PLAY_ACTION_LABEL;
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

function toHeartProduct(item: LibraryCardItem): CatalogListingItem | null {
  const practice = item.practice;

  if (!practice) {
    return null;
  }

  const href = practice.authorSlug
    ? buildPracticePublicPath(practice.authorSlug, practice.slug)
    : `/practice/${practice.slug}`;

  return {
    id: item.practiceId,
    slug: practice.slug,
    href,
    title: practice.title,
    author: practice.authorName ?? "",
    coverUrl: practice.coverUrl,
    coverImage: practice.coverImage,
    updatedAt: practice.updatedAt,
    kind: "practice",
    kindLabel: getDisplayFormat(practice.format) ?? "",
    durationLabel: formatPracticeDuration(practice.durationMinutes),
    priceLabel: getProductPriceLabel(practice.price, practice.isFree),
    accessState: isProductFree(practice.isFree, practice.price) ? "free" : "paid",
    isSaved: item.isSaved,
  };
}

const focusRingClass =
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

export default function LibraryCard({
  item,
  index,
  highlighted = false,
  leaving = false,
  isAuthenticated = true,
  signInReturnPath = "/my-practices",
  onRemovedFromLibrary,
}: LibraryCardProps) {
  const practice = item.practice;
  const isUnavailable = practice === null;
  const title = isUnavailable
    ? "Практика временно недоступна"
    : practice.title.trim();
  const formatLabel = practice ? getDisplayFormat(practice.format) : null;
  const meta = practice ? formatPracticeDuration(practice.durationMinutes) : null;
  const canFullListen = canUseLibraryFullListen(item);
  const audioReady = canFullListen && hasAudioReady(practice?.audioUrl);
  const audioStatus = getAudioStatusLabel(practice?.audioUrl);
  const authorSlug = practice?.authorSlug ?? null;
  const productHref =
    practice?.slug && authorSlug
      ? buildPracticePublicPath(authorSlug, practice.slug)
      : null;
  const canEntitledPlay =
    canFullListen && Boolean(practice?.slug && audioReady && authorSlug);
  const badge = resolveLibraryCardBadge(item);
  const showPaidSaveOffer = canShowLibraryPaidSaveOffer(item);
  const paidPriceLabel = showPaidSaveOffer
    ? formatPracticePrice(practice?.price)
    : null;
  const heartProduct = toHeartProduct(item);
  const canPreviewPlay =
    !canFullListen && Boolean(practice?.slug && authorSlug);

  return (
    <article
      className={`relative flex gap-4 rounded-[24px] border bg-white p-3 pb-14 shadow-[0_8px_22px_rgba(91,62,145,0.06)] transition-opacity duration-200 ${
        highlighted
          ? "border-[#7042c5] ring-2 ring-[#7042c5]/30"
          : "border-[#eadff8]"
      } ${leaving ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      {productHref ? (
        <Link
          href={productHref}
          aria-label={`Открыть «${title}»`}
          className={`absolute inset-0 z-0 rounded-[24px] ${focusRingClass}`}
        />
      ) : null}

      <div className="relative z-[1] aspect-square w-[116px] shrink-0 min-[390px]:w-[124px]">
        <div className="pointer-events-none h-full w-full">
          <ProductCoverThumbnail
            slug={practice?.slug ?? `library-item-${index}`}
            title={title}
            coverUrl={practice?.coverUrl ?? null}
            coverImage={practice?.coverImage}
            updatedAt={practice?.updatedAt}
            authorName={practice?.authorName}
            format={practice?.format}
            displayWidth={124}
            className="aspect-square h-full w-full rounded-[20px]"
          />
        </div>

        {badge ? (
          <span
            data-library-card-badge={badge.id}
            className="pointer-events-none absolute left-2 top-2 z-[2] rounded-full bg-white/92 px-2 py-0.5 text-[11px] font-semibold text-[#7042c5] shadow-sm"
          >
            {badge.label}
          </span>
        ) : null}

        {heartProduct ? (
          <CatalogProductHeartButton
            product={heartProduct}
            isAuthenticated={isAuthenticated}
            signInReturnPath={signInReturnPath}
          />
        ) : null}
      </div>

      <div className="pointer-events-none relative z-[1] flex min-w-0 flex-1 flex-col">
        {formatLabel ? (
          <p className={PRODUCT_FORMAT_LINE_CLASS}>{formatLabel}</p>
        ) : null}

        <p
          className={`line-clamp-2 text-[17px] font-semibold leading-6 text-[#25135c] ${formatLabel ? "mt-1" : ""}`}
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
              <AuthorLink
                authorSlug={practice.authorSlug}
                authorName={practice.authorName}
                stopPropagation
                className="pointer-events-auto relative z-[2] mt-1 text-sm font-medium text-[#25135c]"
              />
            ) : null}

            {meta ? <p className="mt-1 text-sm text-[#7d70a2]">{meta}</p> : null}

            {showPaidSaveOffer && paidPriceLabel ? (
              <div className="pointer-events-auto relative z-[2] mt-2">
                <p className="text-sm font-semibold text-[#25135c]">{paidPriceLabel}</p>
                <BuyPracticeButton
                  practiceSlug={practice.slug}
                  practiceId={item.practiceId}
                  purchaseSurface="catalog_card"
                  label={BUY_ACTION_LABEL}
                  signInReturnPath={signInReturnPath}
                  hidePendingNotice
                  className="mt-2 inline-flex min-h-9 items-center justify-center rounded-[14px] bg-[#7042c5] px-3 text-sm font-semibold text-white"
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="absolute bottom-3 right-3 z-[2] flex items-center gap-1">
        {canEntitledPlay && authorSlug && practice ? (
          <LibraryCardPlayButton
            practiceId={item.practiceId}
            authorSlug={authorSlug}
            productSlug={practice.slug}
            title={title}
            variant="full"
            label={audioStatus}
          />
        ) : canPreviewPlay && authorSlug && practice ? (
          <LibraryCardPreviewPlayButton
            practiceId={item.practiceId}
            authorSlug={authorSlug}
            productSlug={practice.slug}
            title={title}
          />
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

        {practice?.id && practice.slug ? (
          <LibraryPracticeMenu
            practiceId={practice.id}
            practiceSlug={practice.slug}
            practiceTitle={title}
            accessSource={item.accessSource ?? ""}
            onRemoved={onRemovedFromLibrary}
          />
        ) : null}
      </div>
    </article>
  );
}
