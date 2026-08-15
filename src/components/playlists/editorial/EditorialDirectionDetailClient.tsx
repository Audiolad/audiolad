"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { formatEditorialUpdatedAt } from "@/lib/playlists/editorial-workspace";
import type { EditorialDirectionListItem } from "@/lib/playlists/types";
import { EDITORIAL_DIRECTION_NAME_MAX_LENGTH } from "@/lib/playlists/types";

type MemberRow = {
  user_id: string;
  displayName: string;
  email: string | null;
  addedByName: string | null;
  created_at: string;
};

type SearchUser = {
  id: string;
  displayName: string;
  email: string | null;
};

type EditorialDirectionDetailClientProps = {
  direction: EditorialDirectionListItem;
};

export default function EditorialDirectionDetailClient({
  direction,
}: EditorialDirectionDetailClientProps) {
  const router = useRouter();
  const nameId = useId();
  const searchId = useId();
  const [name, setName] = useState(direction.name);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

  async function loadMembers() {
    try {
      const response = await fetch(
        `/api/editorial/directions/${direction.id}/members`,
        { credentials: "same-origin" },
      );

      if (!response.ok) {
        setMemberError("Не удалось загрузить редакторов направления.");
        return;
      }

      const data = (await response.json()) as { members?: MemberRow[] };
      setMembers(data.members ?? []);
      setMemberError(null);
    } catch {
      setMemberError("Не удалось загрузить редакторов направления.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/editorial/directions/${direction.id}/members`,
          { credentials: "same-origin" },
        );

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setMemberError("Не удалось загрузить редакторов направления.");
          return;
        }

        const data = (await response.json()) as { members?: MemberRow[] };
        setMembers(data.members ?? []);
        setMemberError(null);
      } catch {
        if (!cancelled) {
          setMemberError("Не удалось загрузить редакторов направления.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [direction.id]);

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

  async function saveName() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/editorial/directions/${direction.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        setFormError("Не удалось сохранить название.");
        return;
      }

      router.refresh();
    } catch {
      setFormError("Не удалось сохранить название.");
    } finally {
      setSubmitting(false);
    }
  }

  async function addEditor(user: SearchUser) {
    setBusyUserId(user.id);
    setMemberError(null);

    try {
      const response = await fetch(
        `/api/editorial/directions/${direction.id}/members`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id }),
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        if (data.error === "already_exists") {
          setMemberError("Этот пользователь уже назначен.");
          return;
        }

        setMemberError("Не удалось назначить редактора направления.");
        return;
      }

      setQuery("");
      setResults([]);
      await loadMembers();
      router.refresh();
    } catch {
      setMemberError("Не удалось назначить редактора направления.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function revokeEditor(userId: string) {
    setBusyUserId(userId);
    setMemberError(null);

    try {
      const response = await fetch(
        `/api/editorial/directions/${direction.id}/members`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        },
      );

      if (!response.ok) {
        setMemberError("Не удалось отозвать доступ.");
        return;
      }

      await loadMembers();
      router.refresh();
    } catch {
      setMemberError("Не удалось отозвать доступ.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="px-5 pb-10 pt-6">
      <Link
        href="/editorial/directions"
        className="text-sm font-medium text-[#7042c5]"
      >
        ← К направлениям
      </Link>

      <h1 className="mt-4 text-[28px] font-semibold">{direction.name}</h1>
      <p className="mt-2 text-sm text-[#7d70a2]">
        {direction.playlistCount} плейлистов в этом направлении
      </p>

      <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-[21px] font-semibold">Название</h2>
        <label className="mt-4 block" htmlFor={nameId}>
          <span className="sr-only">Название направления</span>
          <input
            id={nameId}
            value={name}
            maxLength={EDITORIAL_DIRECTION_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5]"
          />
        </label>
        {formError ? (
          <p className="mt-3 text-sm text-[#b34f63]" role="alert">
            {formError}
          </p>
        ) : null}
        <button
          type="button"
          disabled={submitting || name.trim().length === 0}
          onClick={() => void saveName()}
          className="mt-4 rounded-[18px] bg-[#7042c5] px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          Сохранить
        </button>
      </section>

      <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-[21px] font-semibold">Редактор направления</h2>
        <p className="mt-1 text-sm leading-6 text-[#7d70a2]">
          Назначьте существующего пользователя Аудиолада. Новые аккаунты здесь
          не создаются.
        </p>

        <label className="mt-4 block" htmlFor={searchId}>
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
                  onClick={() => void addEditor(user)}
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
                  <span className="shrink-0 text-[#7042c5]">Назначить</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {memberError ? (
          <p className="mt-3 text-sm text-[#b34f63]" role="alert">
            {memberError}
          </p>
        ) : null}

        <ul className="mt-5 space-y-3">
          {members.map((row) => (
            <li
              key={row.user_id}
              className="rounded-[18px] border border-[#eadff8] px-4 py-3"
            >
              <p className="font-medium">{row.displayName}</p>
              {row.email ? (
                <p className="mt-0.5 text-sm text-[#7d70a2]">{row.email}</p>
              ) : null}
              <p className="mt-1 text-sm text-[#7d70a2]">
                Редактор направления
                {row.addedByName ? ` · добавил ${row.addedByName}` : ""}
                {row.created_at
                  ? ` · ${formatEditorialUpdatedAt(row.created_at)}`
                  : ""}
              </p>
              <button
                type="button"
                disabled={busyUserId === row.user_id}
                onClick={() => void revokeEditor(row.user_id)}
                className="mt-3 rounded-full border border-[#efc7cf] px-3 py-1.5 text-xs font-medium text-[#b34f63] disabled:opacity-50"
              >
                Отозвать доступ
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
