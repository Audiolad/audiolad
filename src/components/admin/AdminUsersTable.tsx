import Link from "next/link";

import {
  LISTENER_ROLE,
  PLATFORM_ADMIN_ROLE,
  PLATFORM_OWNER_ROLE,
  getPlatformRoleLabel,
} from "@/lib/auth/platform-admin";
import type { AdminUsersPageData } from "@/lib/admin/queries";

type AdminUsersTableProps = {
  data: AdminUsersPageData;
};

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

export default function AdminUsersTable({ data }: AdminUsersTableProps) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

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
                    <th className="px-4 py-3 font-medium">Имя</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Регистрация</th>
                    <th className="px-4 py-3 font-medium">Роль</th>
                    <th className="px-4 py-3 font-medium">Автор</th>
                    <th className="px-4 py-3 font-medium">Практик</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-[#f3edf9] last:border-b-0"
                    >
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
                <h2 className="text-base font-semibold text-[#25135c]">
                  {user.displayName}
                </h2>
                <p className="mt-1 text-sm text-[#796ba0]">{user.email ?? "—"}</p>
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
    </div>
  );
}
