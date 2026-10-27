import "server-only";

import { createClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { chunkIds } from "@/lib/supabase/chunk";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { graduateProductIds, selectGraduateProducts, type SchoolGraduate } from "./graduates";

/** Anonymous catalog client: school visitors must never inherit an admin's visibility. */
export async function loadSchoolGraduateProducts() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } },
  );
  const graduates = await fetchAllPages<SchoolGraduate>((from, to) => supabase.from("school_graduates")
    .select("author_id, cohort, enabled, position, product_1_id, product_2_id").eq("enabled", true)
    .order("author_id").range(from, to));
  const productIds = graduates.flatMap(graduateProductIds);
  if (!productIds.length) return [];
  const products = [];
  for (const ids of chunkIds([...new Set(productIds)])) {
    products.push(...await getPublishedCatalogProducts(supabase, { productIds: ids, throwOnStorageError: true }));
  }
  return selectGraduateProducts(graduates, products);
}
