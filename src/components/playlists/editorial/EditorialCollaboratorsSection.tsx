"use client";

import { useEffect, useId, useState } from "react";

import { formatEditorialUpdatedAt } from "@/lib/playlists/editorial-workspace";
import type { PlaylistCollaboratorRole } from "@/lib/playlists/types";

type CollaboratorRow = {
  user_id: string;
  role: PlaylistCollaboratorRole;
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

function roleLabel(role: PlaylistCollaboratorRole): string {
  return role === "manager" ? "Manager" : "Editor";
}

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
  const [newRole, setNewRole] = useState<PlaylistCollaboratorRole>("editor");

  async function loadCollaborators() {
    setLoadError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        credentials: "same-origin",
      });

      if (!response.ok) {
        setLoadError("Не удалось загрузить редакторов.");
        return;
      }

      const data = (await response.json()) as { collaborators?: CollaboratorRow[] };
      setRows(data.collaborators ?? []);
    } catch {
      setLoadError("Не удалось загрузить редакторов.");
    }
  }

  useEffect(() => {
    void loadCollaborators();
  }, [playlistId]);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setNotFound(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      setNotFound(false);

      try {
        const response = await fetch(
          `/api/editorial/users/search?q=${encodeURIComponent(trimmed)}`,
          { credentials: "same-origin" },
        );
        const data = (await response.json().catch(() => ({}))) as {
          users?: SearchUser[];
        };

        if (!response.ok) {
          setResults([]);
          return;
        }

        const users = data.users ?? [];
        setResults(users);
        setNotFound(users.length === 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  async function addUser(user: SearchUser) {
    setBusyUserId(user.id);
    setFormError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, role: newRole }),
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

        setFormError(data.message || "Не удалось добавить редактора.");
        return;
      }

      setQuery("");
      setResults([]);
      await loadCollaborators();
    } catch {
      setFormError("Не удалось добавить редактора.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function changeRole(userId: string, role: PlaylistCollaboratorRole) {
    setBusyUserId(userId);
    setFormError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role }),
      });

      if (!response.ok) {
        setFormError("Не удалось изменить роль.");
        return;
      }

      await loadCollaborators();
    } catch {
      setFormError("Не удалось изменить роль.");
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
      <h2 className="text-[21px] font-semibold">Редакторы</h2>
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

        <label className="block">
          <span className="mb-2 block text-xs font-medium text-[#7d70a2]">
            Роль
          </span>
          <select
            value={newRole}
            onChange={(event) =>
              setNewRole(event.target.value as PlaylistCollaboratorRole)
            }
            className="w-full rounded-[16px] border border-[#ddcfef] px-3 py-2.5 text-sm outline-none focus:border-[#7042c5]"
          >
            <option value="editor">Editor</option>
            <option value="manager">Manager</option>
          </select>
        </label>
      </div>

      {searching ? (
        <p className="mt-3 text-sm text-[#7d70a2]">Поиск…</p>
      ) : null}

      {notFound ? (
        <p className="mt-3 text-sm text-[#7d70a2]">
          Пользователь Audiolad не найден. Сначала он должен создать аккаунт.
        </p>
      ) : null}

      {results.length > 0 ? (
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
                <span className="shrink-0 text-[#7042c5]">Добавить</span>
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
              {roleLabel(row.role)}
              {row.addedByName ? ` · добавил ${row.addedByName}` : ""}
              {row.created_at
                ? ` · ${formatEditorialUpdatedAt(row.created_at)}`
                : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyUserId === row.user_id}
                onClick={() =>
                  void changeRole(
                    row.user_id,
                    row.role === "editor" ? "manager" : "editor",
                  )
                }
                className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-medium text-[#7042c5] disabled:opacity-50"
              >
                Сделать {row.role === "editor" ? "Manager" : "Editor"}
              </button>
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
