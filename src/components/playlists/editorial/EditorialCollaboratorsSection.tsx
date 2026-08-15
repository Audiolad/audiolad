"use client";

import { useEffect, useId, useState } from "react";

import { formatEditorialUpdatedAt } from "@/lib/playlists/editorial-workspace";

type CollaboratorRow = {
  user_id: string;
  role: string;
  added_by: string | null;
  created_at: string;
  displayName: string;
  email: string | null;
  addedByName: string | null;
};

type SearchUser = {
  id: string;
  displayName: string;
  email: string | null;
};

type EditorialCollaboratorsSectionProps = {
  playlistId: string;
};

export default function EditorialCollaboratorsSection({
  playlistId,
}: EditorialCollaboratorsSectionProps) {
  const searchId = useId();
  const [rows, setRows] = useState<CollaboratorRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadCollaborators() {
    try {
      const response = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        credentials: "same-origin",
      });

      if (!response.ok) {
        setLoadError("Не удалось загрузить администраторов плейлиста.");
        return;
      }

      const data = (await response.json()) as { collaborators?: CollaboratorRow[] };
      setRows(data.collaborators ?? []);
      setLoadError(null);
    } catch {
      setLoadError("Не удалось загрузить администраторов плейлиста.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/playlists/${playlistId}/collaborators`,
          { credentials: "same-origin" },
        );

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setLoadError("Не удалось загрузить администраторов плейлиста.");
          return;
        }

        const data = (await response.json()) as {
          collaborators?: CollaboratorRow[];
        };
        setRows(data.collaborators ?? []);
        setLoadError(null);
      } catch {
        if (!cancelled) {
          setLoadError("Не удалось загрузить администраторов плейлиста.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  const trimmedQuery = query.trim();
  const searchActive = trimmedQuery.length >= 2;

  useEffect(() => {
    if (!searchActive) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);

      try {
        const response = await fetch(
          `/api/editorial/users/search?q=${encodeURIComponent(trimmedQuery)}`,
          { credentials: "same-origin" },
        );
        const data = (await response.json().catch(() => ({}))) as {
          users?: SearchUser[];
        };

        if (!response.ok) {
          setResults([]);
          setNotFound(false);
          return;
        }

        const users = data.users ?? [];
        setResults(users);
        setNotFound(users.length === 0);
      } catch {
        setResults([]);
        setNotFound(false);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchActive, trimmedQuery]);

  async function addUser(user: SearchUser) {
    setBusyUserId(user.id);
    setFormError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, role: "playlist_admin" }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        if (data.error === "already_exists") {
          setFormError("Этот пользователь уже добавлен.");
          return;
        }

        setFormError(data.message || "Не удалось добавить администратора.");
        return;
      }

      setQuery("");
      setResults([]);
      await loadCollaborators();
    } catch {
      setFormError("Не удалось добавить администратора.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function revoke(userId: string) {
    setBusyUserId(userId);
    setFormError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });

      if (!response.ok) {
        setFormError("Не удалось отозвать доступ.");
        return;
      }

      await loadCollaborators();
    } catch {
      setFormError("Не удалось отозвать доступ.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
      <h2 className="text-[21px] font-semibold">Администраторы плейлиста</h2>
      <p className="mt-1 text-sm leading-6 text-[#7d70a2]">
        Добавьте существующего пользователя Аудиолада. Новые аккаунты здесь не
        создаются.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block" htmlFor={searchId}>
          <span className="sr-only">Найти пользователя</span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Имя или email"
            className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5]"
          />
        </label>
      </div>

      {searchActive && searching ? (
        <p className="mt-3 text-sm text-[#7d70a2]">Поиск…</p>
      ) : null}

      {searchActive && notFound ? (
        <p className="mt-3 text-sm text-[#7d70a2]">
          Пользователь Audiolad не найден. Сначала он должен создать аккаунт.
        </p>
      ) : null}

      {searchActive && results.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {results.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                disabled={busyUserId === user.id}
                onClick={() => void addUser(user)}
                className="flex w-full items-center justify-between rounded-[16px] border border-[#eadff8] px-3 py-3 text-left text-sm disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{user.displayName}</span>
                  {user.email ? (
                    <span className="mt-0.5 block truncate text-xs text-[#7d70a2]">
                      {user.email}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[#7042c5]">
                  Добавить администратора
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {formError ? (
        <p className="mt-3 text-sm text-[#b34f63]" role="alert">
          {formError}
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-4 text-sm text-[#b34f63]">{loadError}</p>
      ) : null}

      <ul className="mt-5 space-y-3">
        {rows.map((row) => (
          <li
            key={row.user_id}
            className="rounded-[18px] border border-[#eadff8] px-4 py-3"
          >
            <p className="font-medium">{row.displayName}</p>
            {row.email ? (
              <p className="mt-0.5 text-sm text-[#7d70a2]">{row.email}</p>
            ) : null}
            <p className="mt-1 text-sm text-[#7d70a2]">
              Администратор плейлиста
              {row.addedByName ? ` · добавил ${row.addedByName}` : ""}
              {row.created_at
                ? ` · ${formatEditorialUpdatedAt(row.created_at)}`
                : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyUserId === row.user_id}
                onClick={() => void revoke(row.user_id)}
                className="rounded-full border border-[#efc7cf] px-3 py-1.5 text-xs font-medium text-[#b34f63] disabled:opacity-50"
              >
                Отозвать доступ
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
