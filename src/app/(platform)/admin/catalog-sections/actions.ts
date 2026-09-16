"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/lib/admin/guard";
import { isCatalogSection } from "@/lib/catalog/catalog-sections";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type UpdateCatalogSectionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateCatalogSectionAction(
  practiceId: string,
  nextSection: string | null,
): Promise<UpdateCatalogSectionResult> {
  const session = await requireAdminPermission("products.moderate");

  const normalizedPracticeId = practiceId.trim();

  if (!normalizedPracticeId) {
    return { ok: false, error: "Не удалось определить продукт." };
  }

  const catalogSection =
    nextSection === null || nextSection === ""
      ? null
      : isCatalogSection(nextSection)
        ? nextSection
        : undefined;

  if (catalogSection === undefined) {
    return { ok: false, error: "Неизвестный раздел каталога." };
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("practices")
    .update({ catalog_section: catalogSection })
    .eq("id", normalizedPracticeId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("admin_catalog_section_update_failed", {
      practiceId: normalizedPracticeId,
      adminUserId: session.userId,
      error: error.message,
    });

    return { ok: false, error: "Не удалось сохранить раздел." };
  }

  if (!data?.id) {
    return { ok: false, error: "Продукт не найден." };
  }

  console.info("admin_catalog_section_updated", {
    practiceId: normalizedPracticeId,
    catalogSection,
    adminUserId: session.userId,
  });

  revalidatePath("/admin/catalog-sections");
  revalidatePath("/catalog");

  return { ok: true };
}
