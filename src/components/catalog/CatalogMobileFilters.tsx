"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import {
  CATALOG_ACCESS_FILTER_OPTIONS,
  CATALOG_KIND_FILTER_OPTIONS,
  type CatalogFilterTopicOption,
} from "@/lib/catalog/catalog-filter-ui";
import {
  parseCatalogAccessFilter,
  parseCatalogKindFilter,
  parseCatalogSort,
  type CatalogAccessFilter,
  type CatalogKindFilter,
} from "@/lib/catalog/listing-contract";
import {
  readPlatformSearchListingFromParams,
  readPlatformSearchQueryFromParams,
  readPlatformSearchTopicFromParams,
} from "@/lib/catalog/platform-search";
import {
  buildCatalogHref,
  countCatalogFilterGroups,
  parseCatalogTopicFilters,
  serializeCatalogTopicParam,
  toggleCatalogDraftTopics,
} from "@/lib/catalog/topic-filter";

type CatalogMobileFiltersProps = {
  topics: readonly CatalogFilterTopicOption[];
};

function FilterChip({
  label,
  isActive,
  onSelect,
}: {
  label: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onSelect}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
        isActive
          ? "border-[#7042c5] bg-[#7042c5] text-white"
          : "border-[#ddcfef] bg-white text-[#7042c5]"
      }`}
    >
      {label}
    </button>
  );
}

export default function CatalogMobileFilters({
  topics,
}: CatalogMobileFiltersProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draftTopics, setDraftTopics] = useState<string[]>([]);
  const [draftAccess, setDraftAccess] = useState<CatalogAccessFilter>("all");
  const [draftKind, setDraftKind] = useState<CatalogKindFilter>("all");
  const router = useRouter();
  const searchParams = useSearchParams();

  const searchQuery = readPlatformSearchQueryFromParams(searchParams);
  const topicFromUrl = readPlatformSearchTopicFromParams(searchParams);
  const listingFromUrl = readPlatformSearchListingFromParams(searchParams);
  const activeTopicKeys = parseCatalogTopicFilters(
    topicFromUrl,
    topics.map((topic) => topic.key),
  );
  const access = parseCatalogAccessFilter(listingFromUrl.access);
  const kind = parseCatalogKindFilter(listingFromUrl.kind);
  const sort = parseCatalogSort(listingFromUrl.sort);
  const activeFilterCount = countCatalogFilterGroups({
    topicKeys: activeTopicKeys,
    access,
    kind,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusables = () => {
      if (!panel) {
        return [] as HTMLElement[];
      }

      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
    };

    focusables()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const nodes = focusables();

      if (nodes.length === 0) {
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !panel?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  function openSheet() {
    setDraftTopics(activeTopicKeys);
    setDraftAccess(access);
    setDraftKind(kind);
    setOpen(true);
  }

  function applyDraft() {
    router.replace(
      buildCatalogHref({
        q: searchQuery || null,
        topic: serializeCatalogTopicParam(draftTopics),
        access: draftAccess,
        kind: draftKind,
        sort,
      }),
    );
    close();
  }

  function resetFilters() {
    setDraftTopics([]);
    setDraftAccess("all");
    setDraftKind("all");
    router.replace(
      buildCatalogHref({
        q: searchQuery || null,
        topic: null,
        access: "all",
        kind: "all",
        sort,
      }),
    );
    close();
  }

  return (
    <>
      <button
        type="button"
        data-catalog-mobile-filters-button
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openSheet}
        className="inline-flex h-[52px] shrink-0 items-center rounded-[18px] border border-[#ded1f1] bg-white px-3 text-sm font-medium text-[#7042c5] shadow-[0_2px_10px_rgba(90,60,145,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Фильтры
        {activeFilterCount > 0 ? (
          <span
            data-catalog-mobile-filters-count
            className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[#7042c5] px-1.5 text-[11px] font-semibold text-white"
          >
            {activeFilterCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-[#25135c]/35 px-0"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              close();
            }
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-catalog-mobile-filters-sheet
            className="flex max-h-[min(92vh,720px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[28px] border border-[#eadff8] bg-white shadow-[0_-12px_40px_rgba(91,62,145,0.18)]"
          >
            <div className="shrink-0 border-b border-[#f0e7fa] px-5 pb-4 pt-5">
              <div className="flex items-start justify-between gap-3">
                <h2 id={titleId} className="text-[22px] font-semibold">
                  Фильтры
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-catalog-mobile-filters-reset
                    onClick={resetFilters}
                    className="rounded-full px-2 py-1 text-sm font-medium text-[#7042c5] hover:bg-[#f7f1fc]"
                  >
                    Сбросить
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full px-2 py-1 text-sm text-[#7d70a2] hover:bg-[#f7f1fc]"
                    aria-label="Закрыть"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <section aria-label="Тематика">
                <h3 className="text-sm font-semibold text-[#25135c]">Тематика</h3>
                <div className="mt-3 grid auto-cols-max grid-flow-col grid-rows-2 gap-2 overflow-x-auto">
                  <FilterChip
                    label="Все"
                    isActive={draftTopics.length === 0}
                    onSelect={() => setDraftTopics([])}
                  />
                  {topics.map((topic) => (
                    <FilterChip
                      key={topic.key}
                      label={topic.title}
                      isActive={draftTopics.includes(topic.key)}
                      onSelect={() =>
                        setDraftTopics((current) =>
                          toggleCatalogDraftTopics(current, topic.key),
                        )
                      }
                    />
                  ))}
                </div>
              </section>

              <section className="mt-6" aria-label="Доступ">
                <h3 className="text-sm font-semibold text-[#25135c]">Доступ</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CATALOG_ACCESS_FILTER_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.value}
                      label={option.label}
                      isActive={option.value === draftAccess}
                      onSelect={() => setDraftAccess(option.value)}
                    />
                  ))}
                </div>
              </section>

              <section className="mt-6" aria-label="Тип">
                <h3 className="text-sm font-semibold text-[#25135c]">Тип</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CATALOG_KIND_FILTER_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.value}
                      label={option.label}
                      isActive={option.value === draftKind}
                      onSelect={() => setDraftKind(option.value)}
                    />
                  ))}
                </div>
              </section>
            </div>

            <div className="shrink-0 border-t border-[#f0e7fa] bg-white px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                data-catalog-mobile-filters-apply
                onClick={applyDraft}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
