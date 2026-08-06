import Link from "next/link";

import ProductModerationList from "@/components/admin/ProductModerationList";
import { requireAdminPermission } from "@/lib/admin/guard";
import { listAdminProductModerationQueue } from "@/lib/admin/product-moderation-queries";
import {
  ADMIN_PRODUCT_MODERATION_FILTER_OPTIONS,
  resolveAdminProductModerationFilter,
} from "@/lib/admin/product-moderation-status";

export const dynamic = "force-dynamic";

export default async function AdminProductModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPermission("author_products.moderate");
  const params = await searchParams;
  const filter = resolveAdminProductModerationFilter(params.status);

  let products;

  try {
    products = await listAdminProductModerationQueue({ filter });
  } catch (error) {
    console.error("admin_product_moderation_page_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить очередь модерации. Попробуйте обновить страницу.
      </div>
    );
  }

  const emptyMessage =
    filter === "submitted"
      ? "Сейчас нет продуктов, ожидающих модерации."
      : "В этом фильтре пока нет продуктов.";

  return (
    <section aria-labelledby="admin-product-moderation-heading">
      <h2
        id="admin-product-moderation-heading"
        className="text-[21px] font-semibold"
      >
        Модерация продуктов
      </h2>
      <p className="mt-2 text-sm text-[#796ba0]">
        Проверка авторских продуктов перед публикацией.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {ADMIN_PRODUCT_MODERATION_FILTER_OPTIONS.map((option) => {
          const href =
            option.filterKey === "submitted"
              ? "/admin/product-moderation"
              : `/admin/product-moderation?status=${option.filterKey}`;

          return (
            <Link
              key={option.filterKey}
              href={href}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
                filter === option.filterKey
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#e4d7f4] bg-white text-[#7042c5]"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-5">
        <ProductModerationList products={products} emptyMessage={emptyMessage} />
      </div>
    </section>
  );
}
