import CatalogProductCarousel from "@/components/products/CatalogProductCarousel";
import { getPublishedCatalogSections } from "@/lib/products/catalog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default async function CatalogPage() {
  const supabase = await createClient();
  const { freeProducts, paidProducts } = await getPublishedCatalogSections(supabase);
  const hasAnyProducts = freeProducts.length > 0 || paidProducts.length > 0;

  return (
    <>
      <h1 className="hidden text-[28px] font-semibold xl:block">Каталог</h1>

      <p className="mt-4 text-[15px] leading-6 text-[#7d70a2] xl:mt-3">
        Опубликованные аудиопрактики и программы авторов платформы.
      </p>

      <div
        className="mt-6 flex items-center gap-3 rounded-[22px] border border-[#ded1f1] bg-white/80 px-4 py-3.5 opacity-70"
        aria-label="Поиск скоро появится"
      >
        <span className="text-[#7042c5]">
          <SearchIcon />
        </span>
        <span className="min-w-0 flex-1 text-[15px] text-[#9485b4]">
          Поиск по каталогу скоро появится
        </span>
      </div>

      {freeProducts.length > 0 ? (
        <CatalogProductCarousel
          title="Слушать в подарок"
          products={freeProducts}
          ariaLabel="Слушать в подарок"
          prevAriaLabel="Предыдущие практики в подарок"
          nextAriaLabel="Следующие практики в подарок"
        />
      ) : null}

      {paidProducts.length > 0 ? (
        <CatalogProductCarousel
          title="Аудиопрактики и программы"
          products={paidProducts}
          ariaLabel="Аудиопрактики и программы"
          prevAriaLabel="Предыдущие аудиопрактики и программы"
          nextAriaLabel="Следующие аудиопрактики и программы"
        />
      ) : null}

      {!hasAnyProducts ? (
        <section className="mt-8">
          <div className="rounded-[24px] border border-[#e8def5] bg-[#faf6ff] px-5 py-8 text-center">
            <p className="text-[15px] font-medium text-[#5f3f9d]">
              В каталоге пока нет опубликованных аудиопродуктов.
            </p>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              Новые практики и программы скоро появятся.
            </p>
          </div>
        </section>
      ) : null}
    </>
  );
}
