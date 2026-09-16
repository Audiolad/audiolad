import Link from "next/link";

import CatalogSectionsTable from "@/components/admin/CatalogSectionsTable";
import { requireAdminPermission } from "@/lib/admin/guard";
import { listAdminCatalogSectionProducts } from "@/lib/admin/catalog-sections-queries";
import {
  CATALOG_SECTION_FILTER_OPTIONS,
  resolveCatalogSectionFilter,
} from "@/lib/catalog/catalog-sections";

export const dynamic = "force-dynamic";

export default async function AdminCatalogSectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  await requireAdminPermission("products.view");

  const params = await searchParams;
  const filter = resolveCatalogSectionFilter(params.section);

  let products;

  try {
    products = await listAdminCatalogSectionProducts({ filter });
  } catch (error) {
    console.error("admin_catalog_sections_page_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить продукты. Попробуйте обновить страницу.
      </div>
    );
  }

  return (
    <section aria-labelledby="admin-catalog-sections-heading">
      <h2
        id="admin-catalog-sections-heading"
        className="text-[21px] font-semibold"
      >
        Разделы каталога
      </h2>

      <p className="mt-2 text-sm text-[#796ba0]">
        Назначьте каждому продукту основной раздел каталога.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {CATALOG_SECTION_FILTER_OPTIONS.map((option) => {
          const href =
            option.value === "all"
              ? "/admin/catalog-sections"
              : `/admin/catalog-sections?section=${option.value}`;

          return (
            <Link
              key={option.value}
              href={href}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${
                filter === option.value
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
        <CatalogSectionsTable products={products} />
      </div>
    </section>
  );
}
