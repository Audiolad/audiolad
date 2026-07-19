import Link from "next/link";

import AuthorLink from "@/components/authors/AuthorLink";
import BuyPracticeButton from "@/components/BuyPracticeButton";
import LibraryAddButton from "@/components/LibraryAddButton";
import { ResponsiveCoverImage } from "@/components/images/ResponsiveImage";
import ProductTopicLinks from "@/components/products/ProductTopicLinks";
import type { PracticeAccessPresentation } from "@/lib/products/practice-access-ui";

import type { PracticePageCoverData, PracticePageViewModel } from "./types";

export function disabledButtonClasses(): string {
  return "disabled:cursor-not-allowed disabled:opacity-60";
}

function toolbarActionClassName(kind: "primary" | "secondary"): string {
  if (kind === "primary") {
    return "inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[#7042c5] px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";
  }

  return "inline-flex min-h-11 items-center justify-center rounded-[16px] border border-[#bda6e1] bg-white px-4 py-2.5 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";
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
    <section className="mt-4 rounded-[20px] border border-[#d9c8f4] bg-[#f8f3ff] px-4 py-4 xl:mt-5">
      <p className="text-sm font-semibold text-[#5f3f9d]">
        Предпросмотр для автора
      </p>
      {message ? (
        <p className="mt-1 text-sm leading-6 text-[#7d70a2]">{message}</p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2">
        {actions.map((action) =>
          "disabled" in action && action.disabled ? (
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

export function BuyerPreviewBanner({
  authorModeHref,
  actions,
}: {
  authorModeHref: string;
  actions: PracticeAccessPresentation["authorToolbarActions"];
}) {
  return (
    <section className="mt-4 rounded-[20px] border border-dashed border-[#c9b6e8] bg-[#fcf8ff] px-4 py-4 xl:mt-5">
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
          "disabled" in action && action.disabled ? (
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

export function PracticeAccessBanners({
  presentation,
  practicePagePath,
  listenDeniedMessage,
}: Pick<
  PracticePageViewModel,
  "presentation" | "practicePagePath" | "listenDeniedMessage"
>) {
  return (
    <>
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

export function PracticeProductCover({
  cover,
  priority = false,
  className = "",
}: {
  cover: PracticePageCoverData;
  priority?: boolean;
  className?: string;
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
    </div>
  );
}

export function PracticeMetaSection({
  viewModel,
  subtitleClamp = true,
  titleClassName = "mt-4 text-[32px] font-semibold leading-[1.15]",
}: {
  viewModel: PracticePageViewModel;
  subtitleClamp?: boolean;
  titleClassName?: string;
}) {
  const { presentation, practice, resolvedAuthorSlug, authorName, meta, subtitle, practiceTopics } =
    viewModel;

  return (
    <>
      <span className="inline-flex rounded-full bg-[#f4ecfb] px-4 py-2 text-xs font-semibold text-[#7042c5]">
        {presentation.statusBadge}
      </span>

      {presentation.statusDetail ? (
        <p className="mt-2 text-sm text-[#7d70a2]">{presentation.statusDetail}</p>
      ) : null}

      <h1 className={titleClassName}>{practice.title}</h1>

      {subtitle ? (
        <p
          className={`mt-2 text-base leading-6 text-[#7d70a2] ${
            subtitleClamp ? "line-clamp-3" : ""
          }`.trim()}
        >
          {subtitle}
        </p>
      ) : null}

      {authorName ? (
        <AuthorLink
          authorSlug={resolvedAuthorSlug}
          authorName={authorName}
          className="mt-3 inline-flex min-h-11 items-center text-base font-medium text-[#7042c5]"
        />
      ) : null}

      {meta ? <p className="mt-3 text-sm text-[#7d70a2]">{meta}</p> : null}

      <ProductTopicLinks topics={practiceTopics} className="mt-4" />
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
  const { presentation, practicePagePath } = viewModel;

  return (
    <section className={className}>
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
        className={`w-full rounded-[22px] border px-5 py-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-80 ${
          presentation.libraryAction === "in_library"
            ? "border-[#c9b6ea] bg-[#faf6ff] text-[#7042c5]"
            : "border-[#e2d7f2] bg-[#faf6ff] text-[#7d70a2]"
        } ${disabledButtonClasses()}`}
      />
    </section>
  );
}
