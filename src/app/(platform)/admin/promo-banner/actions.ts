"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/admin/guard";
import { parseManagedCatalogPromo } from "@/lib/catalog/catalog-promo";
import { createClient } from "@/lib/supabase/server";

export async function savePromoBanner(formData: FormData): Promise<void> {
  await requireAdminPermission("settings.manage");
  const promo = parseManagedCatalogPromo({
    id: "catalog",
    enabled: formData.get("enabled") === "on",
    title: formData.get("title"),
    caption: formData.get("caption"),
    image: formData.get("image"),
    href: formData.get("href"),
  });
  if (!promo) redirect("/admin/promo-banner?status=invalid");
  // Use the session client: RLS independently enforces the same permission.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_promo_banners")
    .upsert(promo)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect("/admin/promo-banner?status=error");
  revalidatePath("/catalog");
  revalidatePath("/admin/promo-banner");
  redirect("/admin/promo-banner?status=saved");
}
