"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  LISTENER_ROLE,
  PLATFORM_ADMIN_ROLE,
  PLATFORM_OWNER_ROLE,
  getPlatformRoleLabel,
} from "@/lib/auth/platform-admin";
import type { AdminUsersPageData } from "@/lib/admin/queries";
import { deleteAdminUsers } from "@/app/admin/users/actions";

type AdminUsersTableProps = {
  data: AdminUsersPageData;
};

type PendingDelete =
  | { mode: "single"; userId: string; displayName: string }
  | { mode: "bulk"; userIds: string[] };

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "Все роли" },
  { value: PLATFORM_OWNER_ROLE, label: getPlatformRoleLabel(PLATFORM_OWNER_ROLE) },
  { value: PLATFORM_ADMIN_ROLE, label: getPlatformRoleLabel(PLATFORM_ADMIN_ROLE) },
  { value: LISTENER_ROLE, label: getPlatformRoleLabel(LISTENER_ROLE) },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function buildPageHref(input: {
  page: number;
  query: string;
  roleFilter: string;
}): string {
  const params = new URLSearchParams();

  if (input.query) {
    params.set("q", input.query);
  }

  if (input.roleFilter && input.roleFilter !== "all") {
    params.set("role", input.roleFilter);
  }

  if (input.page > 1) {
    params.set("page", String(input.page));
  }

  const query = params.toString();

  return query ? `/admin/users?${query}` : "/admin/users";
}

function buildDeleteToastMessage(input: {
  deletedCount: number;
  failedCount: number;
  failedMessages: string[];
}): string {
  if (input.deletedCount === 1 && input.failedCount === 0) {
    return "Пользователь удалён";
  }

  if (input.failedCount === 0) {
    return `Удалено пользователей: ${input.deletedCount}`;
  }

  const summary = `Удалено: ${input.deletedCount}. Не удалось удалить: ${input.failedCount}`;
  const firstReason = input.failedMessages[0];

  return firstReason ? `${summary}. ${firstReason}` : summary;
}

function UserRowMenu({
  displayName,
  canDelete,
  blockReason,
  onDelete,
}: {
  displayName: string;
  canDelete: boolean;
  blockReason: string | null;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonId = useId();

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;

      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [menuOpen]);

  return (
    <div className="relative inline-flex" ref={menuRef}>
      <button
        type="button"
        id={menuButtonId}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Действия для ${displayName}`}
        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-xl leading-none text-[#8f82ad] hover:bg-[#f7f1fc] hover:text-[#7042c5]"
        onClick={() => setMenuOpen((open) => !open)}
      >
        ···
      </button>

      {menuOpen ? (
        <div
          role="menu"
          aria-labelledby={menuButtonId}
          className="absolute right-0 top-full z-20 mt-2 min-w-[220px] overflow-hidden rounded-[16px] border border-[#eadff8] bg-white shadow-[0_12px_28px_rgba(91,62,145,0.16)]"
        >
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-3 text-left text-sm text-[#b34f63] hover:bg-[#fff8f9]"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              Удалить пользователя
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled
              title={blockReason ?? undefined}
              className="block w-full px-4 py-3 text-left text-sm text-[#9485b4] disabled:cursor-not-allowed"
            >
              Удалить пользователя
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminUsersTable({ data }: AdminUsersTableProps) {
  const selectionScopeKey = `${data.page}|${data.query}|${data.roleFilter}|${data.actorUserId}`;

  return <AdminUsersTableBody key={selectionScopeKey} data={data} />;
}

function AdminUsersTableBody({ data }: AdminUsersTableProps) {
  const router = useRouter();
  const dialogTitleId = useId();
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const selectableUsers = useMemo(
    () => data.users.filter((user) => user.canDelete),
    [data.users],
  );

  const selectableIds = useMemo(
    () => selectableUsers.map((user) => user.id),
    [selectableUsers],
  );

  const allSelectableSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedIds.includes(id));

  const someSelectableSelected = selectableIds.some((id) =>
    selectedIds.includes(id),
  );

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!pendingDelete || submitting) {
      return;
    }

    cancelDeleteButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setPendingDelete(null);
      setFormError(null);
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pendingDelete, submitting]);

  const toggleUser = useCallback((userId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(userId) ? current : [...current, userId];
      }

      return current.filter((id) => id !== userId);
    });
  }, []);

  const handleUserCheckboxChange = useCallback(
    (userId: string, event: React.ChangeEvent<HTMLInputElement>) => {
      toggleUser(userId, event.currentTarget.checked);
    },
    [toggleUser],
  );

  const toggleAllOnPage = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? [...selectableIds] : []);
    },
    [selectableIds],
  );

  const refreshAfterDelete = useCallback(
    (deletedCount: number) => {
      const newTotal = Math.max(0, data.total - deletedCount);
      const newTotalPages = Math.max(1, Math.ceil(newTotal / data.pageSize));

      if (data.page > newTotalPages) {
        router.push(
          buildPageHref({
            page: newTotalPages,
            query: data.query,
            roleFilter: data.roleFilter,
          }),
        );
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    },
    [data.page, data.pageSize, data.query, data.roleFilter, data.total, router],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || submitting) {
      return;
    }

    const userIds =
      pendingDelete.mode === "single"
        ? [pendingDelete.userId]
        : pendingDelete.userIds;

    setSubmitting(true);
    setFormError(null);

    try {
      const result = await deleteAdminUsers(userIds);

      if (!result.ok && result.forbidden) {
        setFormError("Недостаточно прав для удаления пользователей.");
        return;
      }

      if (result.batchError) {
        setFormError(result.batchError);
        return;
      }

      const failedMessages = result.results
        .filter((row) => !row.ok && row.error)
        .map((row) => row.error as string);

      if (result.deletedCount > 0) {
        setToast(
          buildDeleteToastMessage({
            deletedCount: result.deletedCount,
            failedCount: result.failedCount,
            failedMessages,
          }),
        );
        setSelectedIds((current) =>
          current.filter((id) => !result.results.some((row) => row.ok && row.userId === id)),
        );
        setPendingDelete(null);
        refreshAfterDelete(result.deletedCount);
      }

      if (result.failedCount > 0) {
        if (result.deletedCount === 0) {
          setFormError(failedMessages[0] ?? "Не удалось удалить пользователей.");
        } else {
          setPendingDelete(null);
        }
      }
    } catch {
      setFormError("Не удалось выполнить удаление. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }, [pendingDelete, refreshAfterDelete, submitting]);

  const pendingDeleteTitle =
    pendingDelete?.mode === "single"
      ? "Удалить пользователя?"
      : "Удалить выбранных пользователей?";

  const pendingDeleteText =
    pendingDelete?.mode === "single"
      ? `Пользователь «${pendingDelete.displayName}» и его учётная запись будут удалены без возможности восстановления.`
      : pendingDelete
        ? `Будут удалены ${pendingDelete.userIds.length} учётных записей. Это действие нельзя отменить.`
        : "";

  return (
    <div className="space-y-5">
      <form
        method="get"
        action="/admin/users"
        className="rounded-[22px] border border-[#eadff8] bg-white p-5"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <label className="block">
            <span className="text-sm font-medium text-[#25135c]">Поиск</span>
            <input
              type="search"
              name="q"
              defaultValue={data.query}
              placeholder="Имя или email"
              className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-[#25135c]">Роль</span>
            <select
              name="role"
              defaultValue={data.roleFilter}
              className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm"
            >
              {ROLE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white md:w-auto"
            >
              Найти
            </button>
          </div>
        </div>
      </form>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-3">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full bg-[#b34f63] px-5 text-sm font-medium text-white disabled:opacity-60"
            disabled={submitting || isRefreshing}
            onClick={() => {
              setFormError(null);
              setPendingDelete({ mode: "bulk", userIds: [...selectedIds] });
            }}
          >
            Удалить выбранных ({selectedIds.length})
          </button>
        </div>
      ) : null}

      {data.users.length === 0 ? (
        <div className="rounded-[22px] border border-[#eadff8] bg-white p-8 text-center">
          <p className="text-base font-medium text-[#25135c]">
            Пользователи не найдены
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[22px] border border-[#eadff8] bg-white md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[#eee6f7] bg-[#faf6ff] text-[#796ba0]">
                  <tr>
                    <th className="w-12 px-4 py-3 font-medium">
                      <input
                        type="checkbox"
                        checked={allSelectableSelected}
                        ref={(element) => {
                          if (element) {
                            element.indeterminate =
                              someSelectableSelected && !allSelectableSelected;
                          }
                        }}
                        disabled={selectableIds.length === 0}
                        aria-label="Выбрать всех пользователей на странице"
                        className="h-4 w-4 rounded border-[#bda6e1]"
                        onChange={(event) => toggleAllOnPage(event.target.checked)}
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Имя</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Регистрация</th>
                    <th className="px-4 py-3 font-medium">Роль</th>
                    <th className="px-4 py-3 font-medium">Автор</th>
                    <th className="px-4 py-3 font-medium">Практик</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Действия</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-[#f3edf9] last:border-b-0"
                    >
                      <td className="px-4 py-4">
                        {user.canDelete ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(user.id)}
                            aria-label={`Выбрать ${user.displayName}`}
                            data-testid={`admin-user-select-${user.id}`}
                            className="h-4 w-4 rounded border-[#bda6e1]"
                            onChange={(event) =>
                              handleUserCheckboxChange(user.id, event)
                            }
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={false}
                            disabled
                            aria-label={`${user.displayName}: удаление недоступно`}
                            title={user.deleteBlockReason ?? undefined}
                            className="h-4 w-4 rounded border-[#ddcfef] opacity-50"
                          />
                        )}
                      </td>
                      <td className="px-4 py-4 font-medium text-[#25135c]">
                        {user.displayName}
                      </td>
                      <td className="px-4 py-4 text-[#796ba0]">
                        {user.email ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-[#796ba0]">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-4 text-[#796ba0]">
                        {user.isAuthor
                          ? `${user.roleLabel} · Автор`
                          : user.roleLabel}
                      </td>
                      <td className="px-4 py-4 text-[#796ba0]">
                        {user.isAuthor ? "Да" : "Нет"}
                      </td>
                      <td className="px-4 py-4 text-[#796ba0]">
                        {user.practiceCount ?? 0}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <UserRowMenu
                          displayName={user.displayName}
                          canDelete={user.canDelete}
                          blockReason={user.deleteBlockReason}
                          onDelete={() => {
                            setFormError(null);
                            setPendingDelete({
                              mode: "single",
                              userId: user.id,
                              displayName: user.displayName,
                            });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {data.users.map((user) => (
              <article
                key={user.id}
                className="rounded-[22px] border border-[#eadff8] bg-white p-5"
              >
                <div className="flex items-start gap-3">
                  {user.canDelete ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(user.id)}
                      aria-label={`Выбрать ${user.displayName}`}
                      data-testid={`admin-user-select-mobile-${user.id}`}
                      className="mt-1 h-4 w-4 rounded border-[#bda6e1]"
                      onChange={(event) =>
                        handleUserCheckboxChange(user.id, event)
                      }
                    />
                  ) : (
                    <input
                      type="checkbox"
                      checked={false}
                      disabled
                      aria-label={`${user.displayName}: удаление недоступно`}
                      title={user.deleteBlockReason ?? undefined}
                      className="mt-1 h-4 w-4 rounded border-[#ddcfef] opacity-50"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base font-semibold text-[#25135c]">
                        {user.displayName}
                      </h2>
                      <UserRowMenu
                        displayName={user.displayName}
                        canDelete={user.canDelete}
                        blockReason={user.deleteBlockReason}
                        onDelete={() => {
                          setFormError(null);
                          setPendingDelete({
                            mode: "single",
                            userId: user.id,
                            displayName: user.displayName,
                          });
                        }}
                      />
                    </div>
                    <p className="mt-1 text-sm text-[#796ba0]">
                      {user.email ?? "—"}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 space-y-2 text-sm">
                  <div>
                    <dt className="text-[#9485b4]">Регистрация</dt>
                    <dd className="text-[#25135c]">{formatDate(user.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-[#9485b4]">Роль</dt>
                    <dd className="text-[#25135c]">
                      {user.isAuthor
                        ? `${user.roleLabel} · Автор`
                        : user.roleLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#9485b4]">Практик в аудиотеке</dt>
                    <dd className="text-[#25135c]">{user.practiceCount ?? 0}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          {data.page > 1 ? (
            <Link
              href={buildPageHref({
                page: data.page - 1,
                query: data.query,
                roleFilter: data.roleFilter,
              })}
              className="inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
            >
              Назад
            </Link>
          ) : (
            <span />
          )}

          <p className="text-sm text-[#796ba0]">
            Страница {data.page} из {totalPages}
          </p>

          {data.page < totalPages ? (
            <Link
              href={buildPageHref({
                page: data.page + 1,
                query: data.query,
                roleFilter: data.roleFilter,
              })}
              className="inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
            >
              Далее
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-[#25135c]/35 px-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) {
              setPendingDelete(null);
              setFormError(null);
            }
          }}
        >
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="w-full max-w-[430px] rounded-t-[28px] border border-[#eadff8] bg-white p-5 shadow-[0_-12px_40px_rgba(91,62,145,0.18)] sm:rounded-[28px]"
          >
            <h2 id={dialogTitleId} className="text-[20px] font-semibold text-[#25135c]">
              {pendingDeleteTitle}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
              {pendingDeleteText}
            </p>
            {formError ? (
              <p className="mt-3 text-sm text-[#b34f63]" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button
                ref={cancelDeleteButtonRef}
                type="button"
                className="flex-1 rounded-full border border-[#ddcfef] px-4 py-3 text-sm"
                disabled={submitting}
                onClick={() => {
                  setPendingDelete(null);
                  setFormError(null);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-[#b34f63] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                disabled={submitting}
                onClick={() => void confirmDelete()}
              >
                {submitting ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
          role="status"
        >
          <p className="rounded-full bg-[#25135c] px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </div>
  );
}
