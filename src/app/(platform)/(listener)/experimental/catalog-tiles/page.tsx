import type { Metadata } from "next";
import Link from "next/link";

import ProductGrid from "@/components/products/ProductGrid";
import { getPublishedCatalogSections } from "@/lib/products/catalog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Experimental catalog tiles",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function ExperimentalCatalogTilesPage() {
  const supabase = await createClient();
  const { freeProducts, paidProducts } = await getPublishedCatalogSections(
    supabase,
  );
  const hasAnyProducts = freeProducts.length > 0 || paidProducts.length > 0;

  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
        Experimental preview
      </p>
      <h1 className="mt-2 text-[28px] font-semibold text-[#25135c]">
        Карточки каталога 9:16
      </h1>
      <p className="mt-3 text-[15px] leading-6 text-[#7d70a2]">
        Предпросмотр новой плитки на тех же опубликованных продуктах, что и{" "}
        <Link
          href="/catalog"
          className="font-medium text-[#7042c5] underline-offset-2 hover:underline"
        >
          /catalog
        </Link>
        . Продакшен-каталог не изменён. Это не поисковая страница.
      </p>

      {freeProducts.length > 0 ? (
        <section className="mt-8" aria-labelledby="experimental-catalog-free">
          <h2
            id="experimental-catalog-free"
            className="text-[22px] font-semibold text-[#25135c]"
          >
            Слушать в подарок
          </h2>
          <div className="mt-4">
            <ProductGrid
              products={freeProducts}
              ariaLabel="Слушать в подарок"
            />
          </div>
        </section>
      ) : null}

      {paidProducts.length > 0 ? (
        <section className="mt-8" aria-labelledby="experimental-catalog-paid">
          <h2
            id="experimental-catalog-paid"
            className="text-[22px] font-semibold text-[#25135c]"
          >
            Аудиопрактики и программы
          </h2>
          <div className="mt-4">
            <ProductGrid
              products={paidProducts}
              ariaLabel="Аудиопрактики и программы"
            />
          </div>
        </section>
      ) : null}

      {!hasAnyProducts ? (
        <section className="mt-8">
          <div className="rounded-[24px] border border-[#e8def5] bg-[#faf6ff] px-5 py-8 text-center">
            <p className="text-[15px] font-medium text-[#5f3f9d]">
              В каталоге пока нет опубликованных аудиопродуктов.
            </p>
          </div>
        </section>
      ) : null}
    </>
  );
}
