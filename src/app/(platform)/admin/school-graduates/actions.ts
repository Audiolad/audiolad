"use server";

import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/lib/admin/guard";
import { applyOrdinaryCatalogEligibility } from "@/lib/catalog/visibility-query";
import { graduateText, validateGraduateProductIds } from "@/lib/school/graduates";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type GraduateActionLink = { href: string; label: string };
export type GraduateActionState = { error?: string; errorLinks?: GraduateActionLink[]; success?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publishedOnly = "В подборку можно выбрать только опубликованные и открытые в каталоге продукты этого автора.";
const saveFailed = "Не удалось сохранить подборку. Проверьте публикацию продуктов и обновите страницу.";

/** Admin product page. The author editor 404s for a platform admin who is not a member. */
function publicationLinks(
  ids: string[],
  titles: ReadonlyMap<string, string>,
): GraduateActionLink[] {
  return ids.map((id) => {
    const title = titles.get(id)?.trim();
    return {
      href: `/admin/product-moderation/${id}`,
      label: title ? `Открыть публикацию «${graduateText(title)}»` : "Открыть публикацию продукта",
    };
  });
}

async function linksForProducts(
  supabase: ReturnType<typeof createServiceRoleClient>,
  ids: string[],
): Promise<GraduateActionLink[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const { data } = await supabase.from("practices").select("id, title").in("id", unique);
  const titles = new Map(
    (data ?? []).map((row) => [String(row.id), typeof row.title === "string" ? row.title : ""]),
  );
  return publicationLinks(unique, titles);
}

export async function saveGraduateAction(_: GraduateActionState, form: FormData): Promise<GraduateActionState> {
  await requireAdminPermission("authors.manage");
  const authorId = String(form.get("author_id") ?? "");
  if (!uuid.test(authorId)) return { error: "Выберите существующего автора." };
  const supabase = createServiceRoleClient();
  const operation = form.get("operation");
  if (operation === "remove") {
    const { error } = await supabase.from("school_graduates").delete().eq("author_id", authorId);
    if (error) return { error: "Не удалось убрать выпускника." };
  } else if (operation === "add") {
    const { error } = await supabase.from("school_graduates").insert({ author_id: authorId });
    if (error) return { error: "Не удалось добавить автора. Возможно, он уже в списке." };
  } else if (operation === "save") {
    const ids = form.getAll("product_id").map(String).filter(Boolean);
    const cohort = String(form.get("cohort") ?? "").trim();
    const position = Number(form.get("position"));
    if (!validateGraduateProductIds(ids) || ids.some((id) => !uuid.test(id))) {
      return { error: "Выберите до двух разных продуктов этого автора." };
    }
    if (cohort.length > 100 || !Number.isSafeInteger(position) || position < 0 || position > 2147483647) {
      return { error: "Проверьте поток и порядок показа." };
    }
    const { data: current, error: loadError } = await supabase.from("school_graduates")
      .select("product_1_id, product_2_id").eq("author_id", authorId).maybeSingle();
    if (loadError || !current) return { error: "Выпускник не найден. Обновите страницу." };
    const slots = form.getAll("product_id").map(String);
    if (slots.length !== 2) return { error: "Нужны два слота подборки." };
    const product1 = slots[0] || null;
    const product2 = slots[1] || null;
    const changed = current.product_1_id !== product1 || current.product_2_id !== product2;
    if (changed && ids.length) {
      const { data, error } = await applyOrdinaryCatalogEligibility(supabase.from("practices").select("id"))
        .eq("author_id", authorId).in("id", ids).is("deleted_at", null);
      if (error || data?.length !== ids.length) {
        const eligible = new Set((data ?? []).map((row) => String(row.id)));
        const blocked = error || !data ? ids : ids.filter((id) => !eligible.has(id));
        return { error: publishedOnly, errorLinks: await linksForProducts(supabase, blocked.length ? blocked : ids) };
      }
    }
    const { data: saved, error } = await supabase.from("school_graduates").update({
      product_1_id: product1, product_2_id: product2,
      cohort, position, enabled: form.get("enabled") === "on",
    }).eq("author_id", authorId).select("author_id").maybeSingle();
    if (error || !saved) {
      return {
        error: saveFailed,
        errorLinks: await linksForProducts(supabase, [product1, product2].filter((id): id is string => Boolean(id))),
      };
    }
  } else {
    return { error: "Неизвестное действие." };
  }
  revalidatePath("/admin/school-graduates");
  revalidatePath("/school-site");
  return { success: "Сохранено." };
}
