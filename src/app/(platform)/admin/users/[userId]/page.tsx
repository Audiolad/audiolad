import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminPermission } from "@/lib/admin/guard";
import { getAdminUserDetail } from "@/lib/admin/user-detail";
import { isAdminExactUuid } from "@/lib/admin/users-search";
import { getProductKindLabel } from "@/lib/author-products/product-kind";
import {
  AUTHOR_PUBLICATION_CLASS_LABELS,
  parsePublicationClass,
} from "@/lib/author-products/publication-class";

export const dynamic = "force-dynamic";

function formatDateTime(value: string): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 border-b border-[#f3edf9] py-3 last:border-b-0 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-sm text-[#9485b4]">{label}</dt>
      <dd className="text-sm text-[#25135c] break-all">{value}</dd>
    </div>
  );
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdminPermission("users.view");
  const { userId } = await params;

  if (!isAdminExactUuid(userId)) {
    notFound();
  }

  let detail;

  try {
    detail = await getAdminUserDetail(userId);
  } catch (error) {
    console.error("admin_user_detail_page_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить пользователя. Попробуйте обновить страницу.
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  return (
    <section aria-labelledby="admin-user-detail-heading">
      <div className="mb-5">
        <Link href="/admin/users" className="text-sm font-medium text-[#7042c5]">
          ← К списку пользователей
        </Link>
        <h2
          id="admin-user-detail-heading"
          className="mt-2 text-[21px] font-semibold"
        >
          {detail.displayName}
        </h2>
        <p className="mt-1 text-sm text-[#796ba0]">
          Карточка поддержки. Только просмотр.
        </p>
      </div>

      <div className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">Пользователь</h3>
        <dl className="mt-2">
          <DetailRow label="Имя" value={detail.displayName} />
          <DetailRow label="Email" value={detail.email ?? "—"} />
          <DetailRow label="User ID" value={detail.id} />
          <DetailRow label="Роль профиля" value={detail.profileRoleLabel} />
          <DetailRow
            label="Роли платформы"
            value={
              detail.teamRoleLabels.length > 0
                ? detail.teamRoleLabels.join(", ")
                : "Нет"
            }
          />
          <DetailRow
            label="Регистрация"
            value={formatDateTime(detail.createdAt)}
          />
        </dl>
      </div>

      <div className="mt-5 rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">
          Авторские пространства
        </h3>
        {detail.authorSpaces.length === 0 ? (
          <p className="mt-3 text-sm text-[#796ba0]">
            У пользователя нет авторских пространств.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#eee6f7] text-[#796ba0]">
                <tr>
                  <th className="px-3 py-2 font-medium">Название</th>
                  <th className="px-3 py-2 font-medium">Slug</th>
                  <th className="px-3 py-2 font-medium">Author ID</th>
                  <th className="px-3 py-2 font-medium">Роль</th>
                  <th className="px-3 py-2 font-medium">Доступ</th>
                </tr>
              </thead>
              <tbody>
                {detail.authorSpaces.map((space) => (
                  <tr key={space.authorId} className="border-b border-[#f3edf9]">
                    <td className="px-3 py-3 font-medium text-[#25135c]">
                      {space.name}
                    </td>
                    <td className="px-3 py-3 text-[#796ba0]">{space.slug || "—"}</td>
                    <td className="px-3 py-3 break-all text-[#796ba0]">
                      {space.authorId}
                    </td>
                    <td className="px-3 py-3 text-[#796ba0]">
                      {space.membershipRole}
                    </td>
                    <td className="px-3 py-3 text-[#796ba0]">
                      {space.accessStatusLabel}
                      {space.canBypassProductModeration ? " · обход модерации" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">
          Авторские продукты
        </h3>
        <p className="mt-1 text-sm text-[#796ba0]">
          Все продукты пространств пользователя, включая draft и
          not_submitted. Это не библиотека слушателя.
        </p>
        {detail.products.length === 0 ? (
          <p className="mt-3 text-sm text-[#796ba0]">
            У авторских пространств пока нет продуктов.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#eee6f7] text-[#796ba0]">
                <tr>
                  <th className="px-3 py-2 font-medium">Название</th>
                  <th className="px-3 py-2 font-medium">Slug</th>
                  <th className="px-3 py-2 font-medium">Класс / формат</th>
                  <th className="px-3 py-2 font-medium">Статус</th>
                  <th className="px-3 py-2 font-medium">Модерация</th>
                  <th className="px-3 py-2 font-medium">Обновлён</th>
                  <th className="px-3 py-2 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {detail.products.map((product) => {
                  const publicationClass = parsePublicationClass(
                    product.publicationClass,
                  );

                  return (
                    <tr key={product.id} className="border-b border-[#f3edf9]">
                      <td className="px-3 py-3 font-medium text-[#25135c]">
                        {product.title}
                        <div className="mt-1 break-all text-xs text-[#9485b4]">
                          {product.id}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#796ba0]">
                        {product.slug || "—"}
                      </td>
                      <td className="px-3 py-3 text-[#796ba0]">
                        {publicationClass
                          ? AUTHOR_PUBLICATION_CLASS_LABELS[publicationClass]
                          : getProductKindLabel(product.productKind)}
                        {product.format ? ` · ${product.format}` : ""}
                      </td>
                      <td className="px-3 py-3 text-[#796ba0]">{product.status}</td>
                      <td className="px-3 py-3 text-[#796ba0]">
                        {product.moderationStatus}
                      </td>
                      <td className="px-3 py-3 text-[#796ba0]">
                        {formatDateTime(product.updatedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/products/${product.id}/diagnostics`}
                          className="text-sm font-medium text-[#7042c5]"
                        >
                          Диагностика
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
