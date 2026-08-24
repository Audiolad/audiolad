import Link from "next/link";

import AuthorLink from "@/components/authors/AuthorLink";
import BuyPracticeButton from "@/components/BuyPracticeButton";
import ProductPriceOffer from "@/components/pricing/ProductPriceOffer";
import LibraryAddButton from "@/components/LibraryAddButton";
import { ResponsiveCoverImage } from "@/components/images/ResponsiveImage";
import CatalogProductHeartButton from "@/components/products/CatalogProductHeartButton";
import ProductTopicLinks from "@/components/products/ProductTopicLinks";
import type { CatalogListingItem } from "@/lib/catalog/listing-contract";
import { getProductPriceLabel } from "@/lib/products/price-format";
import type { PracticeAccessPresentation } from "@/lib/products/practice-access-ui";
import { PREVIEW_ACTION_LABEL } from "@/lib/ui/action-labels";

import PracticeListenCtaLink from "./PracticeListenCtaLink";
import PublishPreviewBanner from "./PublishPreviewBanner";
import type { PracticePageCoverData, PracticePageViewModel } from "./types";

export function disabledButtonClasses(): string {
  return "disabled:cursor-not-allowed disabled:opacity-60";
}

function toolbarActionClassName(
  kind: "primary" | "secondary",
  options?: { compact?: boolean },
): string {
  const compact = options?.compact === true;
  const layout = compact
    ? "inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-[16px] px-4 py-2 text-center text-sm font-semibold sm:w-auto"
    : "inline-flex min-h-11 items-center justify-center rounded-[16px] px-4 py-2.5 text-sm font-semibold";

  if (kind === "primary") {
    return `${layout} bg-[#7042c5] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]`;
  }

  return `${layout} border border-[#bda6e1] bg-white text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]`;
}

export function PracticeBackLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/catalog"
      className={`inline-flex items-center text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${className}`.trim()}
    >
      ← Назад в каталог
    </Link>
  );
}

export function AuthorPreviewToolbar({
  message,
  actions,
}: {
  message: string | null;
  actions: PracticeAccessPresentation["authorToolbarActions"];
}) {
  return (
    <section className="mt-4 box-border w-full min-w-0 max-w-full rounded-[20px] border border-[#d9c8f4] bg-[#f8f3ff] px-4 py-4 xl:mt-5">
      <p className="min-w-0 text-sm leading-5 text-[#7d70a2]">
        <span className="font-semibold text-[#5f3f9d]">Предпросмотр для автора</span>
        {message ? (
          <>
            <span className="mx-1.5 text-[#b7a7d4]" aria-hidden="true">
              ·
            </span>
            <span>{message}</span>
          </>
        ) : null}
      </p>
      <div className="mt-2.5 box-border grid w-full min-w-0 max-w-full grid-cols-1 gap-2 sm:grid-cols-[repeat(3,auto)] sm:justify-start">
        {actions.map((action) =>
          "disabled" in action && action.disabled ? (
            <button
              key={action.label}
              type="button"
              disabled
              aria-disabled="true"
              className={`${toolbarActionClassName("secondary", { compact: true })} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {action.label}
            </button>
          ) : (
            <Link
              key={action.label}
              href={action.href}
              className={toolbarActionClassName(
                action.kind === "author_listen" ? "primary" : "secondary",
                { compact: true },
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

export function BuyerPreviewExitControl({
  href,
  label = "Вернуться в режим автора",
  shortLabel = "К режиму автора",
}: {
  href: string;
  label?: string;
  shortLabel?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="fixed right-3 z-[25] inline-flex min-h-11 max-w-[min(calc(100vw-1.5rem),17rem)] items-center gap-2 rounded-full border border-[#bda6e1] bg-white/95 px-3.5 py-2 text-sm font-semibold text-[#7042c5] shadow-[0_10px_28px_rgba(91,62,145,0.18)] backdrop-blur-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] bottom-[calc(var(--global-mini-player-height,0px)+var(--bottom-nav-main-height)+env(safe-area-inset-bottom,0px)+var(--bottom-nav-viewport-offset,0px)+0.75rem)] xl:right-[calc(var(--listener-now-playing-width)+var(--listener-shell-gap)+1.25rem)] xl:bottom-[calc(var(--listener-desktop-player-height,0px)+1.5rem)] xl:px-4"
    >
      <span aria-hidden="true">←</span>
      <span className="xl:hidden">{shortLabel}</span>
      <span className="hidden xl:inline">{label}</span>
    </Link>
  );
}

export function PracticeAccessBanners({
  presentation,
  listenDeniedMessage,
  publishPreview,
}: Pick<
  PracticePageViewModel,
  "presentation" | "listenDeniedMessage" | "publishPreview"
>) {
  if (publishPreview?.enabled) {
    return (
      <PublishPreviewBanner
        practiceId={publishPreview.practiceId}
        editHref={publishPreview.editHref}
        publicPath={publishPreview.publicPath}
        listenerViewHref={publishPreview.listenerViewHref}
        canPublish={publishPreview.canPublish}
      />
    );
  }

  return (
    <>
      {presentation.showAuthorToolbar ? (
        <AuthorPreviewToolbar
          message={presentation.authorToolbarMessage}
          actions={presentation.authorToolbarActions}
        />
      ) : null}

      {presentation.showAdminPreview ? (
        <section className="mt-4 rounded-[20px] border border-[#d9c8f4] bg-[#f8f3ff] px-4 py-4 xl:mt-5">
          <p className="text-sm font-semibold text-[#5f3f9d]">
            Технический просмотр
          </p>
          <p className="mt-1 text-sm leading-6 text-[#7d70a2]">
            Доступ открыт для сотрудника платформы
          </p>
        </section>
      ) : null}

      {listenDeniedMessage ? (
        <section className="mt-4 rounded-[20px] border border-[#f2d4d8] bg-[#fff7f8] px-4 py-4 xl:mt-5">
          <p className="text-sm leading-6 text-[#8d4d57]">{listenDeniedMessage}</p>
        </section>
      ) : null}
    </>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
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

export function toPracticeHeartProduct(
  viewModel: PracticePageViewModel,
): CatalogListingItem {
  return {
    id: viewModel.practice.id,
    slug: viewModel.practice.slug,
    href: viewModel.practicePagePath,
    title: viewModel.practice.title,
    author: viewModel.authorName ?? "",
    coverUrl: viewModel.practice.cover_url,
    coverImage: viewModel.practice.cover_image,
    updatedAt: viewModel.practice.updated_at,
    kind: "practice",
    kindLabel: viewModel.meta ?? "",
    durationLabel: viewModel.meta,
    priceLabel: getProductPriceLabel(
      null,
      viewModel.accessState === "free",
    ),
    accessState: viewModel.accessState,
    isSaved: viewModel.isSaved,
  };
}

export function PracticeProductCover({
  cover,
  priority = false,
  className = "",
  heartProduct = null,
  isAuthenticated = false,
  signInReturnPath = "/catalog",
}: {
  cover: PracticePageCoverData;
  priority?: boolean;
  className?: string;
  heartProduct?: CatalogListingItem | null;
  isAuthenticated?: boolean;
  signInReturnPath?: string;
}) {
  return (
    <div
      className={`relative aspect-square overflow-hidden rounded-[32px] shadow-[0_22px_48px_rgba(99,61,163,0.22)] ${
        cover.displayUrl ? "bg-[#f4ecfb]" : `bg-gradient-to-br ${cover.gradient}`
      } ${className}`.trim()}
    >
      {cover.displayUrl ? (
        <ResponsiveCoverImage
          src={cover.responsive.src ?? cover.displayUrl}
          alt={cover.alt}
          manifest={cover.responsive.manifest}
          srcSet={cover.responsive.srcSet}
          sizes={cover.responsive.srcSet ? cover.responsive.sizes : undefined}
          displayWidth={cover.displayWidth}
          priority={priority}
          className="h-full w-full object-cover"
        />
      ) : (
        <>
          <div className="absolute -left-12 -top-10 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute -bottom-14 -right-12 h-60 w-60 rounded-full bg-[#f8d8c9]/30 blur-2xl" />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-40 w-40 items-center justify-center rounded-full border border-white/45 bg-white/10 text-[90px] text-white shadow-[0_0_50px_rgba(255,255,255,0.32)]">
              {cover.symbol}
            </div>
          </div>
        </>
      )}

      {heartProduct ? (
        <CatalogProductHeartButton
          product={heartProduct}
          isAuthenticated={isAuthenticated}
          signInReturnPath={signInReturnPath}
        />
      ) : null}
    </div>
  );
}

export function PracticeMetaSection({
  viewModel,
  subtitleClamp = true,
  titleClassName = "mt-4 text-[32px] font-semibold leading-[1.15]",
  showTopics = true,
  authorMetaLayout = "stacked",
}: {
  viewModel: PracticePageViewModel;
  subtitleClamp?: boolean;
  titleClassName?: string;
  showTopics?: boolean;
  /** Desktop: author and type/duration on one wrapping line. Mobile keeps stacked by default. */
  authorMetaLayout?: "stacked" | "inline";
}) {
  const { presentation, practice, resolvedAuthorSlug, authorName, meta, subtitle, practiceTopics } =
    viewModel;

  return (
    <>
      <span className="inline-flex rounded-full bg-[#f4ecfb] px-4 py-2 text-xs font-semibold text-[#7042c5]">
        {presentation.statusBadge}
      </span>

      {presentation.statusDetail ? (
        <p className="mt-1.5 text-sm text-[#7d70a2]">{presentation.statusDetail}</p>
      ) : null}

      <h1 className={titleClassName}>{practice.title}</h1>

      {subtitle ? (
        <p
          className={`mt-1.5 text-base leading-6 text-[#7d70a2] ${
            subtitleClamp ? "line-clamp-3" : ""
          }`.trim()}
        >
          {subtitle}
        </p>
      ) : null}

      {authorMetaLayout === "inline" ? (
        authorName || meta ? (
          <p className="mt-2 min-w-0 text-base leading-6 text-[#7d70a2]">
            {authorName ? (
              <AuthorLink
                authorSlug={resolvedAuthorSlug}
                authorName={authorName}
                className="font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              />
            ) : null}
            {authorName && meta ? (
              <span aria-hidden="true"> · </span>
            ) : null}
            {meta ? <span>{meta}</span> : null}
          </p>
        ) : null
      ) : (
        <>
          {authorName ? (
            <AuthorLink
              authorSlug={resolvedAuthorSlug}
              authorName={authorName}
              className="mt-3 inline-flex min-h-11 items-center text-base font-medium text-[#7042c5]"
            />
          ) : null}

          {meta ? <p className="mt-2 text-sm text-[#7d70a2]">{meta}</p> : null}
        </>
      )}

      {showTopics ? (
        <ProductTopicLinks topics={practiceTopics} className="mt-4" />
      ) : null}
    </>
  );
}

export function PracticePrimaryActionSection({
  viewModel,
  className = "mt-6",
}: {
  viewModel: PracticePageViewModel;
  className?: string;
}) {
  const { presentation, practicePagePath, practice, resolvedAuthorSlug } =
    viewModel;
  const playClassName =
    "flex w-full items-center justify-center gap-3 rounded-[22px] border border-[#bca6df] bg-white px-5 py-4 font-semibold text-[#7042c5]";
  const showPrimaryPlay =
    presentation.primaryAction.kind === "listen" ||
    presentation.primaryAction.kind === "buy";
  const playLabel =
    presentation.primaryAction.kind === "listen"
      ? presentation.primaryAction.label
      : PREVIEW_ACTION_LABEL;

  return (
    <section className={className}>
      {showPrimaryPlay ? (
        <PracticeListenCtaLink
          authorSlug={resolvedAuthorSlug}
          productSlug={practice.slug}
          practiceId={practice.id}
          playAriaLabel={playLabel}
          className={playClassName}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7042c5] text-white">
            <PlayIcon />
          </span>
          {playLabel}
        </PracticeListenCtaLink>
      ) : null}

      {presentation.primaryAction.kind === "buy" ? (
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
            {viewModel.priceOffer ? (
              <div className={`${showPrimaryPlay ? "mt-4" : ""} mb-4`}>
                <ProductPriceOffer
                  basePrice={viewModel.priceOffer.basePrice}
                  salePrice={viewModel.priceOffer.salePrice}
                  endsAt={viewModel.priceOffer.endsAt}
                  expiresAt={viewModel.priceOffer.expiresAt}
                  promotionType={viewModel.priceOffer.promotionType}
                />
              </div>
            ) : null}
            <BuyPracticeButton
              practiceSlug={presentation.primaryAction.practiceSlug}
              practiceId={presentation.primaryAction.practiceId}
              authorId={presentation.primaryAction.authorId}
              productPriceMinorSnapshot={
                presentation.primaryAction.productPriceMinorSnapshot
              }
              currency={presentation.primaryAction.currency}
              purchaseSurface={presentation.primaryAction.purchaseSurface}
              label={presentation.primaryAction.label}
              className={`${showPrimaryPlay && !viewModel.priceOffer ? "mt-3" : ""} w-full rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9974d8] px-5 py-4 text-sm font-semibold text-white`}
              signInReturnPath={practicePagePath}
            />
            {presentation.showPaymentLegalNote ? <PaymentLegalNote /> : null}
          </>
        )
      ) : !showPrimaryPlay ? (
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
      ) : null}
    </section>
  );
}

export function PracticeLibraryActionSection({
  viewModel,
  className = "mt-4",
}: {
  viewModel: PracticePageViewModel;
  className?: string;
}) {
  const {
    presentation,
    practice,
    practicePagePath,
    promoListenPath,
    promoConversionMode,
  } = viewModel;

  if (presentation.libraryAction === "hidden") {
    return null;
  }

  return (
    <section className={className}>
      <LibraryAddButton
        practiceSlug={practice.slug}
        practiceId={practice.id}
        promoSignup={promoConversionMode}
        signInReturnPath={promoConversionMode ? promoListenPath : practicePagePath}
        action={presentation.libraryAction}
        variant="practice"
      />
    </section>
  );
}
