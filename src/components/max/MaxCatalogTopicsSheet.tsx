"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  CATALOG_ACCESS_FILTER_OPTIONS,
  CATALOG_CLASS_FILTER_OPTIONS,
} from "@/lib/catalog/catalog-filter-ui";
import type {
  CatalogAccessFilter,
  CatalogClassFilter,
} from "@/lib/catalog/listing-contract";
import {
  countCatalogFilterGroups,
  toggleCatalogDraftTopics,
} from "@/lib/catalog/topic-filter";
import { readMaxInitData } from "@/lib/max/bridge";
import { MAX_CATALOG_TOPICS_PATH } from "@/lib/max/host";
import { useSheetScrollLock } from "@/lib/listener/use-sheet-scroll-lock";

export type MaxCatalogTopicOption = {
  key: string;
  title: string;
};

type MaxCatalogTopicsSheetProps = {
  activeTopicKeys: readonly string[];
  activeAccess: CatalogAccessFilter;
  activeClass: CatalogClassFilter;
  onApply: (
    keys: string[],
    access: CatalogAccessFilter,
    publicationClass: CatalogClassFilter,
  ) => void;
  onReset: () => void;
};

function readTopics(payload: unknown): MaxCatalogTopicOption[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const topics = (payload as { topics?: unknown }).topics;
  if (!Array.isArray(topics)) {
    return null;
  }

  return topics.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const topic = item as { key?: unknown; title?: unknown };
    if (typeof topic.key !== "string" || typeof topic.title !== "string") {
      return [];
    }

    return [{ key: topic.key, title: topic.title }];
  });
}

function TopicChip({
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

export default function MaxCatalogTopicsSheet({
  activeTopicKeys,
  activeAccess,
  activeClass,
  onApply,
  onReset,
}: MaxCatalogTopicsSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draftTopics, setDraftTopics] = useState<string[]>([]);
  const [draftAccess, setDraftAccess] = useState<CatalogAccessFilter>("all");
  const [draftClass, setDraftClass] = useState<CatalogClassFilter>("all");
  const [topics, setTopics] = useState<MaxCatalogTopicOption[]>([]);
  const [topicsStatus, setTopicsStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  useSheetScrollLock(open, "max-catalog-topics");

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const initData = readMaxInitData();
        if (!initData) {
          if (!controller.signal.aborted) {
            setTopicsStatus("error");
          }
          return;
        }

        const response = await fetch(MAX_CATALOG_TOPICS_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) {
          return;
        }
        const nextTopics = response.ok ? readTopics(payload) : null;
        if (!nextTopics) {
          setTopicsStatus("error");
          return;
        }
        setTopics(nextTopics);
        setTopicsStatus("ready");
      } catch {
        if (!controller.signal.aborted) {
          setTopicsStatus("error");
        }
      }
    })();

    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
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
      ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);
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
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  function openSheet() {
    setDraftTopics([...activeTopicKeys]);
    setDraftAccess(activeAccess);
    setDraftClass(activeClass);
    setTopicsStatus("loading");
    setOpen(true);
  }

  function applyDraft() {
    onApply(draftTopics, draftAccess, draftClass);
    setOpen(false);
  }

  function resetFilters() {
    onReset();
    setOpen(false);
  }

  const activeFilterCount = countCatalogFilterGroups({
    topicKeys: activeTopicKeys,
    access: activeAccess,
    class: activeClass,
  });

  const sheet = open ? (
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
        data-max-catalog-topics-sheet
        className="flex max-h-[min(92vh,720px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[28px] border border-[#eadff8] bg-white shadow-[0_-12px_40px_rgba(91,62,145,0.18)]"
      >
        <div className="shrink-0 border-b border-[#f0e7fa] px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-[22px] font-semibold">
              Темы
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-max-catalog-topics-reset
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
          <section aria-label="Темы">
            <h3 className="text-sm font-semibold text-[#25135c]">Темы</h3>
            {topicsStatus === "loading" ? (
              <p className="mt-3 text-sm text-[#6c5d94]">Загружаем темы…</p>
            ) : null}
            {topicsStatus === "error" ? (
              <p className="mt-3 text-sm text-[#6c5d94]">Не удалось загрузить темы.</p>
            ) : null}
            {topicsStatus === "ready" && topics.length === 0 ? (
              <p className="mt-3 text-sm text-[#6c5d94]">Сейчас нет тем с аудиопродуктами.</p>
            ) : null}
            {topicsStatus === "ready" && topics.length > 0 ? (
              <div className="mt-3 grid auto-cols-max grid-flow-col grid-rows-2 gap-2 overflow-x-auto">
                <TopicChip
                  label="Все"
                  isActive={draftTopics.length === 0}
                  onSelect={() => setDraftTopics([])}
                />
                {topics.map((topic) => (
                  <TopicChip
                    key={topic.key}
                    label={topic.title}
                    isActive={draftTopics.includes(topic.key)}
                    onSelect={() =>
                      setDraftTopics((current) => toggleCatalogDraftTopics(current, topic.key))
                    }
                  />
                ))}
              </div>
            ) : null}
          </section>

          <section className="mt-6" aria-label="Доступ">
            <h3 className="text-sm font-semibold text-[#25135c]">Доступ</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {CATALOG_ACCESS_FILTER_OPTIONS.map((option) => (
                <TopicChip
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
              {CATALOG_CLASS_FILTER_OPTIONS.map((option) => (
                <TopicChip
                  key={option.value}
                  label={option.label}
                  isActive={option.value === draftClass}
                  onSelect={() => setDraftClass(option.value)}
                />
              ))}
            </div>
          </section>
        </div>

        <div className="shrink-0 border-t border-[#f0e7fa] bg-white px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            data-max-catalog-topics-apply
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
        data-max-catalog-topics
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Темы"
        onClick={openSheet}
        className="inline-flex h-[52px] shrink-0 items-center rounded-[18px] border border-[#ded1f1] bg-white px-3 text-sm font-medium text-[#7042c5] shadow-[0_2px_10px_rgba(90,60,145,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Темы
        {activeFilterCount > 0 ? (
          <span
            data-max-catalog-topics-count
            className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[#7042c5] px-1.5 text-[11px] font-semibold text-white"
          >
            {activeFilterCount}
          </span>
        ) : null}
      </button>
      {sheet ? createPortal(sheet, document.body) : null}
    </>
  );
}
