import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadManagedCatalogPromo(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("platform_promo_banners")
    .select("id, enabled, title, caption, image, href")
    .eq("id", "catalog")
    .maybeSingle();
  if (error) throw new Error("platform_promo_banner_load_failed");
  return data;
}

/** A missing migration or unavailable promo must never break listening. */
export async function loadManagedCatalogPromoSafe(supabase: SupabaseClient) {
  try {
    return await loadManagedCatalogPromo(supabase);
  } catch {
    console.warn("platform_promo_banner_unavailable");
    return null;
  }
}
