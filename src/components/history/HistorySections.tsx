import Link from "next/link";

import AuthorLink from "@/components/authors/AuthorLink";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import {
  getCompletedStatusLabel,
  getHistoryEmptyState,
  getHistoryFilterLabels,
} from "@/lib/history/format";
import { buildHistoryFilterHref } from "@/lib/history/logic";
import type { HistoryFilter, HistoryGroup, HistoryItem } from "@/lib/history/types";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import { buildPracticePublicPath } from "@/lib/products/paths";

const focusRingClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const actionButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

type HistoryFiltersProps = {
  activeFilter: HistoryFilter;
};

export function HistoryFilters({ activeFilter }: HistoryFiltersProps) {
  return (
    <nav className="mt-7 xl:mt-6" aria-label="Фильтры истории">
      <div className="flex gap-2 overflow-x-auto pb-2 xl:overflow-visible">
        {getHistoryFilterLabels().map(({ filter, label }) => {
          const isActive = filter === activeFilter;

          return (
            <Link
              key={filter}
              href={buildHistoryFilterHref(filter)}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] xl:min-h-10 xl:px-4 xl:py-1.5 ${
                isActive
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HistoryProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-[#eee6f7]"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Прогресс прослушивания ${clamped} процентов`}
    >
      <div
        className="h-full rounded-full bg-[#7042c5]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

type HistoryCardProps = {
  item: HistoryItem;
};

function HistoryCardCover({
  item,
  productHref,
  size,
}: {
  item: HistoryItem;
  productHref: string;
  size: "mobile" | "desktop";
}) {
  const isDesktop = size === "desktop";
  const dimension = isDesktop ? 152 : 108;

  return (
    <Link
      href={productHref}
      className={`${isDesktop ? "h-[152px] w-[152px]" : "h-[108px] w-[108px]"} shrink-0 ${focusRingClass}`}
    >
      <ProductCoverThumbnail
        slug={item.productSlug}
        title={item.title}
        coverUrl={item.coverUrl}
        coverImage={item.coverImage}
        updatedAt={item.updatedAt}
        authorName={item.authorName}
        format={item.formatLabel}
        displayWidth={dimension}
        className={`${isDesktop ? "h-[152px] w-[152px]" : "h-[108px] w-[108px]"} rounded-[20px]`}
      />
    </Link>
  );
}

function HistoryCardDetails({
  item,
  productHref,
  variant,
}: {
  item: HistoryItem;
  productHref: string;
  variant: "mobile" | "desktop";
}) {
  const isDesktop = variant === "desktop";

  return (
    <>
      {item.formatLabel ? (
        <p className={PRODUCT_FORMAT_LINE_CLASS}>{item.formatLabel}</p>
      ) : null}

      <Link
        href={productHref}
        className={`line-clamp-2 font-semibold leading-6 text-[#25135c] ${focusRingClass} ${
          isDesktop ? "text-[18px]" : "text-[17px]"
        } ${item.formatLabel ? "mt-1" : ""}`}
      >
        {item.title}
      </Link>

      {item.authorName ? (
        <AuthorLink
          authorSlug={item.authorSlug}
          authorName={item.authorName}
          className="mt-1 text-sm font-medium text-[#7042c5]"
        />
      ) : null}

      {item.metaLabel ? (
        <p className="mt-1 text-sm text-[#7d70a2]">{item.metaLabel}</p>
      ) : null}
    </>
  );
}

function HistoryCardProgress({ item }: { item: HistoryItem }) {
  if (item.status === "completed") {
    return (
      <p className="mt-2 text-sm font-medium text-[#3d8d65]">
        {getCompletedStatusLabel()}
      </p>
    );
  }

  return (
    <>
      {item.isProgram && item.stepLabel ? (
        <p className="mt-2 text-sm text-[#796ba0]">{item.stepLabel}</p>
      ) : null}

      <div className="mt-3">
        <HistoryProgressBar percent={item.progressPercent} />
      </div>
    </>
  );
}

export function HistoryCard({ item }: HistoryCardProps) {
  const productHref =
    item.authorSlug && item.productSlug
      ? buildPracticePublicPath(item.authorSlug, item.productSlug)
      : "/catalog";

  return (
    <article className="rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-[0_8px_22px_rgba(91,62,145,0.06)] xl:p-5">
      <div className="flex gap-4 xl:hidden">
        <HistoryCardCover item={item} productHref={productHref} size="mobile" />

        <div className="flex min-w-0 flex-1 flex-col">
          <HistoryCardDetails
            item={item}
            productHref={productHref}
            variant="mobile"
          />
          <HistoryCardProgress item={item} />

          {item.status !== "completed" ? (
            <p className="mt-2 text-xs text-[#8a7ca9]">{item.progressLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="hidden xl:flex xl:gap-5">
        <HistoryCardCover item={item} productHref={productHref} size="desktop" />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <HistoryCardDetails
                item={item}
                productHref={productHref}
                variant="desktop"
              />
            </div>

            <Link href={item.actionHref} className={`${actionButtonClass} xl:min-h-10`}>
              {item.actionLabel}
            </Link>
          </div>

          <HistoryCardProgress item={item} />

          <div className="mt-3 flex items-center justify-between gap-4">
            {item.status !== "completed" ? (
              <p className="text-xs text-[#8a7ca9]">{item.progressLabel}</p>
            ) : (
              <span aria-hidden="true" />
            )}

            <p className="ml-auto shrink-0 text-xs text-[#8a7ca9]">
              {item.lastActivityLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#eee6f7] pt-3 xl:hidden">
        <p className="text-xs text-[#8a7ca9]">{item.lastActivityLabel}</p>

        <Link href={item.actionHref} className={actionButtonClass}>
          {item.actionLabel}
        </Link>
      </div>
    </article>
  );
}

type HistoryEmptyStateProps = {
  filter: HistoryFilter;
};

export function HistoryEmptyState({ filter }: HistoryEmptyStateProps) {
  const state = getHistoryEmptyState(filter);

  return (
    <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-white px-5 py-8 text-center">
      <h2 className="text-lg font-semibold text-[#25135c]">{state.title}</h2>
      <p className="mt-3 text-sm leading-6 text-[#796ba0]">{state.description}</p>

      <Link
        href={state.ctaHref}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        {state.ctaLabel}
      </Link>
    </section>
  );
}

type HistoryGroupsListProps = {
  groups: HistoryGroup[];
};

export function HistoryGroupsList({ groups }: HistoryGroupsListProps) {
  return (
    <div className="mt-7 space-y-8 xl:space-y-10">
      {groups.map((group) => (
        <section key={group.period} aria-labelledby={`history-group-${group.period}`}>
          <h2
            id={`history-group-${group.period}`}
            className="text-[21px] font-semibold text-[#25135c] xl:text-[22px]"
          >
            {group.title}
          </h2>

          <div className="mt-4 space-y-4 xl:space-y-5">
            {group.items.map((item) => (
              <HistoryCard key={item.practiceId} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HistoryPageHeader() {
  return (
    <header className="flex items-center justify-between px-5 pt-5 xl:hidden">
      <Link
        href="/profile"
        aria-label="Назад в профиль"
        className={`flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5] ${focusRingClass}`}
      >
        <BackIcon />
      </Link>

      <div className="text-center">
        <h1 className="text-[26px] font-semibold">История</h1>
        <p className="mt-1 text-xs text-[#7d70a2]">
          Что вы слушали и где остановились
        </p>
      </div>

      <div className="h-11 w-11" aria-hidden="true" />
    </header>
  );
}
