"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import {
  PLAYLIST_MAX_ITEMS,
  PLAYLIST_MAX_PER_USER,
  PLAYLIST_TITLE_MAX_LENGTH,
  type PlaylistMembershipItem,
  type PlaylistVisibility,
} from "@/lib/playlists/types";

type AddToPlaylistSheetProps = {
  practiceId: string;
  practiceTitle: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; playlists: PlaylistMembershipItem[] };

function visibilityLabel(visibility: PlaylistVisibility): string {
  return visibility === "public" ? "Доступен всем" : "Только для меня";
}

async function readApiError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string;
      message?: string;
    };

    if (typeof data.message === "string" && data.message.trim()) {
      return data.message.trim();
    }

    if (data.error === "limit_reached") {
      return "В плейлисте может быть не больше 100 материалов.";
    }

    if (data.error === "public_content_invalid") {
      return "В публичный плейлист можно добавлять только подарочные материалы, доступные всем.";
    }

    if (data.error === "entitlement_required") {
      return "Недостаточно доступа, чтобы добавить материал в плейлист.";
    }

    if (data.error === "unauthorized") {
      return "Нужно войти в аккаунт.";
    }

    if (data.error === "not_found") {
      return "Плейлист не найден.";
    }
  } catch {
    // ignore
  }

  return "Не удалось сохранить. Попробуйте ещё раз.";
}

export default function AddToPlaylistSheet({
  practiceId,
  practiceTitle,
  open,
  onClose,
  onSaved,
}: AddToPlaylistSheetProps) {
  const titleId = useId();
  const newTitleInputId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialSelected, setInitialSelected] = useState<Set<string>>(
    new Set(),
  );
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const busy = submitting || creatingPlaylist;

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function load() {
      setLoadState({ status: "loading" });
      setFormError(null);
      setCreating(false);
      setNewTitle("");

      try {
        const response = await fetch(
          `/api/playlists/membership?practiceId=${encodeURIComponent(practiceId)}`,
          { method: "GET", credentials: "same-origin" },
        );

        if (!response.ok) {
          if (!cancelled) {
            setLoadState({ status: "error" });
          }
          return;
        }

        const data = (await response.json()) as {
          playlists?: PlaylistMembershipItem[];
        };
        const playlists = Array.isArray(data.playlists) ? data.playlists : [];
        const nextSelected = new Set(
          playlists.filter((item) => item.contains).map((item) => item.id),
        );

        if (!cancelled) {
          setSelected(nextSelected);
          setInitialSelected(new Set(nextSelected));
          setLoadState({ status: "ready", playlists });
        }
      } catch {
        if (!cancelled) {
          setLoadState({ status: "error" });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, practiceId]);

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

    const initial = focusables()[0];
    initial?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
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
  }, [open, busy, onClose, loadState.status, creating]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!open) {
    return toast ? (
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
        role="status"
      >
        <p className="rounded-full bg-[#25135c] px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </p>
      </div>
    ) : null;
  }

  const playlists =
    loadState.status === "ready" ? loadState.playlists : [];
  const atPlaylistLimit = playlists.length >= PLAYLIST_MAX_PER_USER;

  const selectionChanged = (() => {
    if (selected.size !== initialSelected.size) {
      return true;
    }

    for (const id of selected) {
      if (!initialSelected.has(id)) {
        return true;
      }
    }

    return false;
  })();

  function togglePlaylist(item: PlaylistMembershipItem) {
    const disabled = !item.contains && !item.canAdd;

    if (disabled || busy) {
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);

      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }

      return next;
    });
  }

  async function handleSave() {
    if (busy) {
      return;
    }

    if (!selectionChanged) {
      onClose();
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch("/api/playlists/membership", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceId,
          playlistIds: Array.from(selected),
        }),
      });

      if (!response.ok) {
        setFormError(await readApiError(response));
        return;
      }

      setToast("Плейлисты обновлены.");
      onClose();
      onSaved?.();
      startTransition(() => {
        // allow parent refresh hooks if any
      });
    } catch {
      setFormError("Не удалось сохранить. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreatePlaylist(event: FormEvent) {
    event.preventDefault();

    if (busy || atPlaylistLimit) {
      return;
    }

    const title = newTitle.trim();

    if (!title) {
      setFormError("Введите название плейлиста.");
      return;
    }

    setCreatingPlaylist(true);
    setFormError(null);

    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, visibility: "private" }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          setFormError("Можно создать не больше 50 плейлистов.");
        } else {
          setFormError(await readApiError(response));
        }
        return;
      }

      const data = (await response.json()) as {
        playlist?: {
          id: string;
          title: string;
          visibility: PlaylistVisibility;
        };
      };

      if (!data.playlist?.id) {
        setFormError("Не удалось создать плейлист.");
        return;
      }

      const created: PlaylistMembershipItem = {
        id: data.playlist.id,
        title: data.playlist.title,
        visibility: data.playlist.visibility,
        contains: false,
        itemsCount: 0,
        canAdd: true,
        reason: "ok",
      };

      setLoadState((prev) => {
        if (prev.status !== "ready") {
          return { status: "ready", playlists: [created] };
        }

        return {
          status: "ready",
          playlists: [created, ...prev.playlists],
        };
      });
      setSelected((prev) => new Set(prev).add(created.id));
      setCreating(false);
      setNewTitle("");
    } catch {
      setFormError("Не удалось создать плейлист.");
    } finally {
      setCreatingPlaylist(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-end justify-center bg-[#25135c]/35 px-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:px-4"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) {
            onClose();
          }
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="flex max-h-[min(92vh,720px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[28px] border border-[#eadff8] bg-white shadow-[0_-12px_40px_rgba(91,62,145,0.18)] sm:rounded-[28px]"
        >
          <div className="shrink-0 border-b border-[#f0e7fa] px-5 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id={titleId} className="text-[22px] font-semibold">
                  Добавить в плейлист
                </h2>
                <p className="mt-1 line-clamp-2 text-sm text-[#7d70a2]">
                  {practiceTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!busy) {
                    onClose();
                  }
                }}
                className="rounded-full px-2 py-1 text-sm text-[#7d70a2] hover:bg-[#f7f1fc]"
                aria-label="Закрыть"
              >
                Закрыть
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {loadState.status === "loading" || loadState.status === "idle" ? (
              <p className="py-8 text-center text-sm text-[#7d70a2]">
                Загрузка плейлистов…
              </p>
            ) : null}

            {loadState.status === "error" ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[#7d70a2]">
                  Не удалось загрузить плейлисты. Попробуйте ещё раз.
                </p>
                <button
                  type="button"
                  className="mt-4 rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white"
                  onClick={() => {
                    setLoadState({ status: "idle" });
                    // re-trigger via practiceId dependency by forcing reload
                    setLoadState({ status: "loading" });
                    void fetch(
                      `/api/playlists/membership?practiceId=${encodeURIComponent(practiceId)}`,
                      { method: "GET", credentials: "same-origin" },
                    )
                      .then(async (response) => {
                        if (!response.ok) {
                          setLoadState({ status: "error" });
                          return;
                        }

                        const data = (await response.json()) as {
                          playlists?: PlaylistMembershipItem[];
                        };
                        const next = Array.isArray(data.playlists)
                          ? data.playlists
                          : [];
                        const nextSelected = new Set(
                          next
                            .filter((item) => item.contains)
                            .map((item) => item.id),
                        );
                        setSelected(nextSelected);
                        setInitialSelected(new Set(nextSelected));
                        setLoadState({ status: "ready", playlists: next });
                      })
                      .catch(() => setLoadState({ status: "error" }));
                  }}
                >
                  Повторить
                </button>
              </div>
            ) : null}

            {loadState.status === "ready" && playlists.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm leading-6 text-[#7d70a2]">
                  У вас пока нет плейлистов.
                  <br />
                  Создайте первый плейлист и добавьте в него этот материал.
                </p>
                {!creating ? (
                  <button
                    type="button"
                    className="mt-5 rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white"
                    onClick={() => {
                      setCreating(true);
                      setFormError(null);
                    }}
                    disabled={busy}
                  >
                    Создать плейлист
                  </button>
                ) : null}
              </div>
            ) : null}

            {loadState.status === "ready" && playlists.length > 0 ? (
              <ul className="space-y-2">
                {playlists.map((item) => {
                  const checked = selected.has(item.id);
                  const disabled = !item.contains && !item.canAdd;
                  const full = item.itemsCount >= PLAYLIST_MAX_ITEMS && !checked;

                  return (
                    <li key={item.id}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-[18px] border border-[#eadff8] px-4 py-3 ${
                          disabled || full ? "cursor-not-allowed opacity-60" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          disabled={disabled || full || busy}
                          onChange={() => togglePlaylist(item)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-5">
                            {item.title}
                          </span>
                          <span className="mt-1 block text-xs text-[#7d70a2]">
                            {visibilityLabel(item.visibility)}
                            {" · "}
                            {item.itemsCount} из {PLAYLIST_MAX_ITEMS}
                          </span>
                          {item.visibility === "public" &&
                          !item.canAdd &&
                          !item.contains ? (
                            <span className="mt-1 block text-xs text-[#b34f63]">
                              Только подарочные общедоступные материалы
                            </span>
                          ) : null}
                          {full ? (
                            <span className="mt-1 block text-xs text-[#b34f63]">
                              Достигнут лимит 100 материалов
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {creating ? (
              <form
                className="mt-4 rounded-[20px] border border-[#eadff8] bg-[#fbf8ff] p-4"
                onSubmit={(event) => void handleCreatePlaylist(event)}
              >
                <label className="block" htmlFor={newTitleInputId}>
                  <span className="text-sm font-medium">Название</span>
                  <input
                    id={newTitleInputId}
                    type="text"
                    value={newTitle}
                    maxLength={PLAYLIST_TITLE_MAX_LENGTH}
                    onChange={(event) => setNewTitle(event.target.value)}
                    className="mt-2 w-full rounded-[16px] border border-[#ddcfef] bg-white px-3 py-3 outline-none focus:border-[#7042c5]"
                    placeholder="Например, Утро в ресурсе"
                    autoFocus
                    disabled={busy}
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-full border border-[#ddcfef] px-4 py-2.5 text-sm"
                    onClick={() => {
                      setCreating(false);
                      setNewTitle("");
                    }}
                    disabled={busy}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-full bg-[#7042c5] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                    disabled={busy || !newTitle.trim()}
                  >
                    {creatingPlaylist ? "Создание…" : "Создать"}
                  </button>
                </div>
              </form>
            ) : null}

            {formError ? (
              <p className="mt-4 text-sm text-[#b34f63]" role="alert">
                {formError}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 space-y-2 border-t border-[#f0e7fa] px-5 py-4">
            {loadState.status === "ready" && !creating ? (
              <button
                type="button"
                className="w-full rounded-full border border-[#ddcfef] px-4 py-3 text-sm font-medium text-[#25135c] disabled:opacity-60"
                onClick={() => {
                  setCreating(true);
                  setFormError(null);
                }}
                disabled={busy || atPlaylistLimit}
              >
                Новый плейлист
              </button>
            ) : null}

            {loadState.status === "ready" ? (
              <button
                type="button"
                className="w-full rounded-full bg-[#7042c5] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                onClick={() => void handleSave()}
                disabled={busy || (playlists.length === 0 && !selectionChanged)}
              >
                {submitting ? "Сохранение…" : "Сохранить"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
          role="status"
        >
          <p className="rounded-full bg-[#25135c] px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </>
  );
}
