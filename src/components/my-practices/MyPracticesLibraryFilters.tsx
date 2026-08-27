"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  LIBRARY_COLLECTION_FILTERS,
  type LibraryFilterId,
} from "@/lib/library/filters";

const CATALOG_SHEET_LOCK_CLASS = "catalog-sheet-lock";

let catalogSheetLockCount = 0;

function acquireCatalogSheetLock() {
  catalogSheetLockCount += 1;
  if (catalogSheetLockCount === 1) {
    document.documentElement.classList.add(CATALOG_SHEET_LOCK_CLASS);
  }
}

function releaseCatalogSheetLock() {
  if (catalogSheetLockCount <= 0) {
    catalogSheetLockCount = 0;
    return;
  }

  catalogSheetLockCount -= 1;
  if (catalogSheetLockCount === 0) {
    document.documentElement.classList.remove(CATALOG_SHEET_LOCK_CLASS);
  }
}

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

type MyPracticesLibraryFiltersProps = {
  filter: LibraryFilterId;
  onApply: (filter: LibraryFilterId) => void;
  onReset: () => void;
};

export default function MyPracticesLibraryFilters({
  filter,
  onApply,
  onReset,
}: MyPracticesLibraryFiltersProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState<LibraryFilterId>(filter);
  const [mounted, setMounted] = useState(false);
  const holdsSheetLockRef = useRef(false);
  const activeFilterCount = filter === "all" ? 0 : 1;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!holdsSheetLockRef.current) {
      acquireCatalogSheetLock();
      holdsSheetLockRef.current = true;
    }

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
      if (holdsSheetLockRef.current) {
        releaseCatalogSheetLock();
        holdsSheetLockRef.current = false;
      }
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (holdsSheetLockRef.current) {
        releaseCatalogSheetLock();
        holdsSheetLockRef.current = false;
      }
    };
  }, []);

  function close() {
    setOpen(false);
  }

  function openSheet() {
    setDraftFilter(filter);
    setOpen(true);
  }

  function applyDraft() {
    close();
    onApply(draftFilter);
  }

  function resetFilters() {
    setDraftFilter("all");
    close();
    onReset();
  }

  const sheet =
    open && mounted ? (
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
          data-library-filters-sheet
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
                  data-library-filters-reset
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
            <section aria-label="Коллекция">
              <h3 className="text-sm font-semibold text-[#25135c]">Коллекция</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {LIBRARY_COLLECTION_FILTERS.map((option) => (
                  <FilterChip
                    key={option.id}
                    label={option.label}
                    isActive={option.id === draftFilter}
                    onSelect={() => setDraftFilter(option.id)}
                  />
                ))}
              </div>
            </section>
          </div>

          <div className="shrink-0 border-t border-[#f0e7fa] bg-white px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              data-library-filters-apply
              onClick={applyDraft}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Применить
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        data-library-filters-button
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openSheet}
        className="inline-flex h-[52px] shrink-0 items-center rounded-[18px] border border-[#ded1f1] bg-white px-3 text-sm font-medium text-[#7042c5] shadow-[0_2px_10px_rgba(90,60,145,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Фильтры
        {activeFilterCount > 0 ? (
          <span
            data-library-filters-count
            className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[#7042c5] px-1.5 text-[11px] font-semibold text-white"
          >
            {activeFilterCount}
          </span>
        ) : null}
      </button>
      {sheet && typeof document !== "undefined"
        ? createPortal(sheet, document.body)
        : null}
    </>
  );
}
