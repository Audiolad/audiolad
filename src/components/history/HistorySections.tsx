import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import {
  getCompletedStatusLabel,
  getHistoryEmptyState,
  getHistoryFilterLabels,
} from "@/lib/history/format";
import { buildHistoryFilterHref } from "@/lib/history/logic";
import type { HistoryFilter, HistoryGroup, HistoryItem } from "@/lib/history/types";
import { PRODUCT_SERVICE_LINE_CLASS } from "@/lib/products/product-service-label";
import { buildPracticePublicPath } from "@/lib/products/paths";

type HistoryFiltersProps = {
  activeFilter: HistoryFilter;
};

export function HistoryFilters({ activeFilter }: HistoryFiltersProps) {
  return (
    <nav className="mt-7" aria-label="Фильтры истории">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {getHistoryFilterLabels().map(({ filter, label }) => {
          const isActive = filter === activeFilter;

          return (
            <Link
              key={filter}
              href={buildHistoryFilterHref(filter)}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
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

export function HistoryCard({ item }: HistoryCardProps) {
  const productHref =
    item.authorSlug && item.productSlug
      ? buildPracticePublicPath(item.authorSlug, item.productSlug)
      : "/catalog";

  return (
    <article className="rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-[0_8px_22px_rgba(91,62,145,0.06)]">
      <div className="flex gap-4">
        <Link
          href={productHref}
          className="h-[108px] w-[108px] shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <ProductCoverThumbnail
            slug={item.productSlug}
            title={item.title}
            coverUrl={item.coverUrl}
            authorName={item.authorName}
            format={item.formatLabel}
            className="h-[108px] w-[108px] rounded-[20px]"
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col">
          {item.serviceLineLabel ? (
            <p className={PRODUCT_SERVICE_LINE_CLASS}>{item.serviceLineLabel}</p>
          ) : null}

          <Link
            href={productHref}
            className={`line-clamp-2 text-[17px] font-semibold leading-6 text-[#25135c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${item.serviceLineLabel ? "mt-1" : ""}`}
          >
            {item.title}
          </Link>

          {item.authorName ? (
            <p className="mt-1 text-sm font-medium text-[#7042c5]">
              {item.authorName}
            </p>
          ) : null}

          {item.metaLabel ? (
            <p className="mt-1 text-sm text-[#7d70a2]">{item.metaLabel}</p>
          ) : null}

          {item.status === "completed" ? (
            <p className="mt-2 text-sm font-medium text-[#3d8d65]">
              {getCompletedStatusLabel()}
            </p>
          ) : (
            <>
              {item.isProgram && item.stepLabel ? (
                <p className="mt-2 text-sm text-[#796ba0]">{item.stepLabel}</p>
              ) : null}

              <div className="mt-3">
                <HistoryProgressBar percent={item.progressPercent} />
              </div>

              <p className="mt-2 text-xs text-[#8a7ca9]">{item.progressLabel}</p>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#eee6f7] pt-3">
        <p className="text-xs text-[#8a7ca9]">{item.lastActivityLabel}</p>

        <Link
          href={item.actionHref}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
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
    <div className="mt-7 space-y-8">
      {groups.map((group) => (
        <section key={group.period} aria-labelledby={`history-group-${group.period}`}>
          <h2
            id={`history-group-${group.period}`}
            className="text-[21px] font-semibold text-[#25135c]"
          >
            {group.title}
          </h2>

          <div className="mt-4 space-y-4">
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
    <header className="flex items-center justify-between">
      <Link
        href="/profile"
        aria-label="Назад в профиль"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
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
