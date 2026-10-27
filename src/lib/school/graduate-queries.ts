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
  const rows = await fetchAllPages<{
    author_id: string;
    position: number;
    product_1_id: string | null;
    product_2_id: string | null;
  }>((from, to) => supabase.from("school_graduate_showcase")
    .select("author_id, position, product_1_id, product_2_id")
    .order("position").order("author_id").range(from, to));
  const graduates: SchoolGraduate[] = rows.map((row) => ({
    author_id: row.author_id,
    cohort: "",
    enabled: true,
    position: row.position,
    product_1_id: row.product_1_id,
    product_2_id: row.product_2_id,
  }));
  const productIds = graduates.flatMap(graduateProductIds);
  if (!productIds.length) return [];
  const products = [];
  for (const ids of chunkIds([...new Set(productIds)])) {
    products.push(...await getPublishedCatalogProducts(supabase, { productIds: ids, throwOnStorageError: true }));
  }
  return selectGraduateProducts(graduates, products);
}
