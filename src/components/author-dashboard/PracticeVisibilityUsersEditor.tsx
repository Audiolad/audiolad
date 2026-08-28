"use client";

import { useEffect, useState } from "react";

import {
  validateVisibilityLookupQuery,
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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

  async function handleAdd() {
    if (!practiceId || disabled || busy) {
      return;
    }

    const validationError = validateVisibilityLookupQuery(query);

    if (validationError) {
      setMessage(validationError);
      return;
    }

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
        message?: string;
      } | null;

      if (!lookupResponse.ok || !lookupPayload?.user?.userId) {
        setMessage("Пользователь не найден.");
        return;
      }

      const addResponse = await fetch(
        `/api/author/products/${practiceId}/visibility-users`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: lookupPayload.user.userId }),
        },
      );

      if (!addResponse.ok) {
        setMessage("Не удалось добавить пользователя.");
        return;
      }

      setQuery("");
      setUsers(await fetchVisibilityUsers(practiceId));
    } catch {
      setMessage("Не удалось добавить пользователя.");
    } finally {
      setBusy(false);
    }
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          disabled={disabled || busy || !practiceId}
          placeholder="Email или UUID пользователя"
          className="min-w-0 flex-1 rounded-[16px] border border-[#e4d7f4] px-4 py-2.5 text-sm"
          onChange={(event) => setQuery(event.target.value)}
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
      {message ? <p className="text-sm text-[#b42318]">{message}</p> : null}
      {visibleUsers.length === 0 ? (
        <p className="text-sm text-[#7d70a2]">
          Пока никого нет. Добавьте пользователя по точному email или UUID.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleUsers.map((user) => (
            <li
              key={user.userId}
              className="flex items-center justify-between gap-3 rounded-[16px] border border-[#e4d7f4] bg-white px-4 py-2.5"
            >
              <span className="text-sm text-[#3f3560]">{user.displayName}</span>
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
