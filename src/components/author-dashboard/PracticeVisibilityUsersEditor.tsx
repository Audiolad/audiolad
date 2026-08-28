"use client";

import { useEffect, useRef, useState } from "react";

import {
  VISIBILITY_SEARCH_DEBOUNCE_MS,
  formatVisibilityUserPrimaryLabel,
  isVisibilityUserAlreadySelected,
  shouldSearchVisibilityUsers,
  validateVisibilityLookupQuery,
  type PracticeVisibilitySearchHit,
  type PracticeVisibilityUser,
} from "@/lib/author-products/visibility-users";

type PracticeVisibilityUsersEditorProps = {
  practiceId: string | null;
  disabled?: boolean;
};

async function fetchVisibilityUsers(
  practiceId: string,
): Promise<PracticeVisibilityUser[]> {
  const response = await fetch(
    `/api/author/products/${practiceId}/visibility-users`,
  );
  const payload = (await response.json().catch(() => null)) as {
    users?: PracticeVisibilityUser[];
  } | null;

  if (!response.ok) {
    throw new Error("load_failed");
  }

  return payload?.users ?? [];
}

export default function PracticeVisibilityUsersEditor({
  practiceId,
  disabled = false,
}: PracticeVisibilityUsersEditorProps) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PracticeVisibilityUser[]>([]);
  const [hits, setHits] = useState<PracticeVisibilitySearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const visibleUsers = practiceId ? users : [];

  useEffect(() => {
    if (!practiceId) {
      return;
    }

    let cancelled = false;

    fetchVisibilityUsers(practiceId)
      .then((nextUsers) => {
        if (!cancelled) {
          setUsers(nextUsers);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("Не удалось загрузить список пользователей.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [practiceId]);

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    abortRef.current?.abort();
    abortRef.current = null;

    if (!practiceId || disabled || !shouldSearchVisibilityUsers(query)) {
      setHits([]);
      setSearching(false);
      setDropdownOpen(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSearching(true);
    setDropdownOpen(true);

    debounceRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const response = await fetch(
            `/api/author/products/${practiceId}/visibility-users/lookup`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: query.trim() }),
              signal: controller.signal,
            },
          );
          const payload = (await response.json().catch(() => null)) as {
            users?: PracticeVisibilitySearchHit[];
          } | null;

          if (requestIdRef.current !== requestId) {
            return;
          }

          setHits(Array.isArray(payload?.users) ? payload.users.slice(0, 10) : []);
        } catch (error) {
          if (
            requestIdRef.current !== requestId ||
            (error instanceof DOMException && error.name === "AbortError")
          ) {
            return;
          }

          setHits([]);
        } finally {
          if (requestIdRef.current === requestId) {
            setSearching(false);
          }
        }
      })();
    }, VISIBILITY_SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [disabled, practiceId, query]);

  function clearSearch() {
    setQuery("");
    setHits([]);
    setDropdownOpen(false);
  }

  async function persistAddedUser(userId: string) {
    if (!practiceId) {
      return;
    }

    const addResponse = await fetch(
      `/api/author/products/${practiceId}/visibility-users`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      },
    );

    if (!addResponse.ok) {
      setMessage("Не удалось добавить пользователя.");
      return;
    }

    clearSearch();
    setUsers(await fetchVisibilityUsers(practiceId));
  }

  async function addUserById(userId: string) {
    if (!practiceId || disabled || busy) {
      return;
    }

    if (isVisibilityUserAlreadySelected(users, userId)) {
      setMessage("Этот пользователь уже добавлен.");
      clearSearch();
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await persistAddedUser(userId);
    } catch {
      setMessage("Не удалось добавить пользователя.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    if (!practiceId || disabled || busy) {
      return;
    }

    const exactError = validateVisibilityLookupQuery(query);

    setBusy(true);
    setMessage(null);

    try {
      const lookupResponse = await fetch(
        `/api/author/products/${practiceId}/visibility-users/lookup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim() }),
        },
      );
      const lookupPayload = (await lookupResponse.json().catch(() => null)) as {
        user?: { userId?: string; displayName?: string };
        users?: PracticeVisibilitySearchHit[];
        message?: string;
      } | null;

      const resolvedUserId =
        lookupPayload?.user?.userId ??
        (lookupPayload?.users?.length === 1
          ? lookupPayload.users[0]?.userId
          : undefined);

      if (!lookupResponse.ok || !resolvedUserId) {
        setMessage(
          exactError && !shouldSearchVisibilityUsers(query)
            ? exactError
            : "Пользователи не найдены",
        );
        setHits(lookupPayload?.users ?? []);
        setDropdownOpen((lookupPayload?.users?.length ?? 0) > 1);
        return;
      }

      if (
        (lookupPayload?.users?.length ?? 0) > 1 &&
        !lookupPayload?.user?.userId
      ) {
        setHits(lookupPayload?.users ?? []);
        setDropdownOpen(true);
        setMessage("Выберите пользователя из списка.");
        return;
      }

      if (isVisibilityUserAlreadySelected(users, resolvedUserId)) {
        setMessage("Этот пользователь уже добавлен.");
        clearSearch();
        return;
      }

      await persistAddedUser(resolvedUserId);
    } catch {
      setMessage("Не удалось добавить пользователя.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectHit(hit: PracticeVisibilitySearchHit) {
    await addUserById(hit.userId);
  }

  async function handleRemove(userId: string) {
    if (!practiceId || disabled || busy) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/author/products/${practiceId}/visibility-users?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        setMessage("Не удалось удалить пользователя.");
        return;
      }

      setUsers(await fetchVisibilityUsers(practiceId));
    } catch {
      setMessage("Не удалось удалить пользователя.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm font-medium text-[#3f3560]">
        Кому показывать этот продукт
      </p>
      <p className="text-sm text-[#7d70a2]">
        Найдите пользователя по имени, фамилии или email.
      </p>
      <div className="relative space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={query}
            disabled={disabled || busy || !practiceId}
            placeholder="Имя, фамилия, email или UUID"
            autoComplete="off"
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-autocomplete="list"
            className="min-w-0 flex-1 rounded-[16px] border border-[#e4d7f4] px-4 py-2.5 text-sm"
            onChange={(event) => {
              setQuery(event.target.value);
              setMessage(null);
            }}
            onFocus={() => {
              if (hits.length > 0 || searching) {
                setDropdownOpen(true);
              }
            }}
            onBlur={() => {
              window.setTimeout(() => {
                setDropdownOpen(false);
              }, 150);
            }}
          />
          <button
            type="button"
            disabled={disabled || busy || !practiceId}
            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              void handleAdd();
            }}
          >
            Добавить
          </button>
        </div>
        {dropdownOpen ? (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-[16px] border border-[#e4d7f4] bg-white p-1 shadow-lg sm:max-w-[calc(100%-7.5rem)]"
          >
            {searching ? (
              <li className="px-3 py-2 text-sm text-[#7d70a2]">Ищем…</li>
            ) : hits.length === 0 ? (
              <li className="px-3 py-2 text-sm text-[#7d70a2]">
                Пользователи не найдены
              </li>
            ) : (
              hits.map((hit) => (
                <li key={hit.userId}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left hover:bg-[#f8f4ff]"
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      void handleSelectHit(hit);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[#3f3560]">
                        {formatVisibilityUserPrimaryLabel(hit)}
                      </span>
                      {hit.maskedEmail ? (
                        <span className="block text-xs text-[#7d70a2]">
                          {hit.maskedEmail}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      {message ? <p className="text-sm text-[#b42318]">{message}</p> : null}
      {visibleUsers.length === 0 ? (
        <p className="text-sm text-[#7d70a2]">
          Пока никого нет. Найдите пользователя по имени, фамилии или email.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleUsers.map((user) => (
            <li
              key={user.userId}
              className="flex items-center justify-between gap-3 rounded-[16px] border border-[#e4d7f4] bg-white px-4 py-2.5"
            >
              <span className="min-w-0">
                <span className="block text-sm text-[#3f3560]">
                  {formatVisibilityUserPrimaryLabel(user)}
                </span>
                {user.maskedEmail ? (
                  <span className="block text-xs text-[#7d70a2]">
                    {user.maskedEmail}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                disabled={disabled || busy}
                className="text-sm font-medium text-[#7042c5] disabled:opacity-60"
                onClick={() => {
                  void handleRemove(user.userId);
                }}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
