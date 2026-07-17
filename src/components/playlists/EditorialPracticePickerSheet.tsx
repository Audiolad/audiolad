"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import type { EditorialPracticeOption } from "@/lib/playlists/editorial-practices";

type EditorialPracticePickerSheetProps = {
  playlistId: string;
  open: boolean;
  onClose: () => void;
  onAdded?: () => void;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; practices: EditorialPracticeOption[] };

type PriceFilter = "all" | "free" | "paid";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M5 10.5 8.5 14 15 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function EditorialPracticePickerSheet({
  playlistId,
  open,
  onClose,
  onAdded,
}: EditorialPracticePickerSheetProps) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const searchId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadCatalog() {
      setLoadState({ status: "loading" });
      setQuery("");
      setAuthorFilter("all");
      setPriceFilter("all");
      setSelectedIds(new Set());
      setFormError(null);

      try {
        const response = await fetch(
          `/api/playlists/${playlistId}/editorial-practices`,
          { credentials: "same-origin" },
        );

        if (cancelled) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          setLoadState({
            status: "error",
            message: "Недостаточно прав для управления этим плейлистом.",
          });
          return;
        }

        if (!response.ok) {
          setLoadState({
            status: "error",
            message: "Не удалось загрузить каталог. Попробуйте ещё раз.",
          });
          return;
        }

        const data = (await response.json()) as {
          practices?: EditorialPracticeOption[];
        };

        if (cancelled) {
          return;
        }

        setLoadState({
          status: "ready",
          practices: data.practices ?? [],
        });
      } catch {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message: "Не удалось загрузить каталог. Попробуйте ещё раз.",
          });
        }
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [open, playlistId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const authors = useMemo(() => {
    if (loadState.status !== "ready") {
      return [];
    }

    const map = new Map<string, string>();

    for (const practice of loadState.practices) {
      map.set(practice.authorId, practice.authorName);
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }, [loadState]);

  const filteredPractices = useMemo(() => {
    if (loadState.status !== "ready") {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();

    return loadState.practices.filter((practice) => {
      if (authorFilter !== "all" && practice.authorId !== authorFilter) {
        return false;
      }

      if (priceFilter === "free" && !practice.isFree) {
        return false;
      }

      if (priceFilter === "paid" && practice.isFree) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        practice.title.toLowerCase().includes(normalizedQuery) ||
        practice.authorName.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [authorFilter, loadState, priceFilter, query]);

  function toggleSelection(practiceId: string, alreadyAdded: boolean) {
    if (alreadyAdded || submitting) {
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(practiceId)) {
        next.delete(practiceId);
      } else {
        next.add(practiceId);
      }

      return next;
    });
  }

  async function submitSelection() {
    if (submitting || selectedIds.size === 0) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(
        `/api/playlists/${playlistId}/editorial-practices`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            practiceIds: Array.from(selectedIds),
          }),
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setFormError(
          data.message ||
            "Не удалось добавить материалы. Попробуйте ещё раз.",
        );
        return;
      }

      onClose();
      onAdded?.();
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setFormError("Не удалось добавить материалы. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#25135c]/35 px-0 sm:items-center sm:px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88vh] w-full max-w-[430px] flex-col rounded-t-[28px] border border-[#eadff8] bg-white shadow-[0_-12px_40px_rgba(91,62,145,0.18)] sm:max-h-[80vh] sm:rounded-[28px]"
      >
        <div className="border-b border-[#f0e8fb] px-5 py-5">
          <h2 id={titleId} className="text-[22px] font-semibold">
            Добавить практики
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            Выберите опубликованные материалы из каталога.
          </p>
        </div>

        <div className="space-y-3 border-b border-[#f0e8fb] px-5 py-4">
          <label className="block" htmlFor={searchId}>
            <span className="sr-only">Поиск по названию</span>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по названию или автору"
              className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5]"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-[#7d70a2]">
                Автор
              </span>
              <select
                value={authorFilter}
                onChange={(event) => setAuthorFilter(event.target.value)}
                className="w-full rounded-[16px] border border-[#ddcfef] px-3 py-2.5 text-sm outline-none focus:border-[#7042c5]"
              >
                <option value="all">Все авторы</option>
                {authors.map((author) => (
                  <option key={author.id} value={author.id}>
                    {author.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-[#7d70a2]">
                Стоимость
              </span>
              <select
                value={priceFilter}
                onChange={(event) =>
                  setPriceFilter(event.target.value as PriceFilter)
                }
                className="w-full rounded-[16px] border border-[#ddcfef] px-3 py-2.5 text-sm outline-none focus:border-[#7042c5]"
              >
                <option value="all">Все</option>
                <option value="free">Подарки</option>
                <option value="paid">Платные</option>
              </select>
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loadState.status === "loading" ? (
            <p className="text-sm text-[#7d70a2]">Загрузка каталога…</p>
          ) : null}

          {loadState.status === "error" ? (
            <p className="text-sm text-[#b34f63]">{loadState.message}</p>
          ) : null}

          {loadState.status === "ready" && filteredPractices.length === 0 ? (
            <p className="text-sm text-[#7d70a2]">
              Ничего не найдено. Измените фильтры или поисковый запрос.
            </p>
          ) : null}

          {loadState.status === "ready" && filteredPractices.length > 0 ? (
            <ul className="space-y-3">
              {filteredPractices.map((practice) => {
                const selected = selectedIds.has(practice.id);
                const disabled = practice.alreadyAdded || submitting;

                return (
                  <li key={practice.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      aria-label={
                        practice.alreadyAdded
                          ? `${practice.title} уже добавлена`
                          : selected
                            ? `Убрать ${practice.title} из выбора`
                            : `Выбрать ${practice.title}`
                      }
                      onClick={() =>
                        toggleSelection(practice.id, practice.alreadyAdded)
                      }
                      className={`flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition ${
                        practice.alreadyAdded
                          ? "border-[#eadff8] bg-[#faf6ff] opacity-70"
                          : selected
                            ? "border-[#7042c5] bg-[#faf6ff]"
                            : "border-[#eadff8] bg-white"
                      } disabled:cursor-not-allowed`}
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[16px] bg-[#efe4fb]">
                        {practice.coverDisplayUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={practice.coverDisplayUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {practice.title}
                        </p>
                        <p className="mt-1 truncate text-xs text-[#7d70a2]">
                          {practice.authorName}
                          {practice.formatLabel
                            ? ` · ${practice.formatLabel}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-[#8a7ca9]">
                          {practice.priceLabel}
                          {practice.metaLabel ? ` · ${practice.metaLabel}` : ""}
                        </p>
                        {practice.alreadyAdded ? (
                          <p className="mt-1 text-xs font-medium text-[#7042c5]">
                            Уже в плейлисте
                          </p>
                        ) : null}
                      </div>

                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                          practice.alreadyAdded || selected
                            ? "border-[#7042c5] bg-[#7042c5] text-white"
                            : "border-[#cfc0e8] bg-white text-transparent"
                        }`}
                        aria-hidden
                      >
                        <CheckIcon />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="border-t border-[#f0e8fb] px-5 py-4">
          {formError ? (
            <p className="mb-3 text-sm text-[#b34f63]" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-[18px] border border-[#ddcfef] px-4 py-3 font-medium text-[#7042c5] disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={submitting || selectedIds.size === 0}
              onClick={() => void submitSelection()}
              className="rounded-[18px] bg-[#7042c5] px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {submitting
                ? "Добавление…"
                : `Добавить (${selectedIds.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
