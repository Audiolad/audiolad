import { Suspense } from "react";

import CatalogMobileFilters from "@/components/catalog/CatalogMobileFilters";
import { listTopicsWithCatalogCounts } from "@/lib/topics/queries";
import { createClient } from "@/lib/supabase/server";

async function CatalogMobileFiltersReady() {
  const supabase = await createClient();
  const topics = (await listTopicsWithCatalogCounts(supabase))
    .filter((topic) => topic.catalogProductCount > 0)
    .map((topic) => ({ key: topic.key, title: topic.title }));

  return <CatalogMobileFilters topics={topics} />;
}

export default function CatalogMobileFiltersSlot() {
  return (
    <Suspense
      fallback={
        <span
          aria-hidden="true"
          className="inline-flex h-[52px] shrink-0 items-center rounded-[18px] border border-[#ded1f1] bg-white px-3 text-sm font-medium text-[#7042c5]"
        >
          Фильтры
        </span>
      }
    >
      <CatalogMobileFiltersReady />
    </Suspense>
  );
}
