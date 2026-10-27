import SchoolGraduatesEditor from "@/components/admin/SchoolGraduatesEditor";
import { requireAdminPermission } from "@/lib/admin/guard";
import { applyOrdinaryCatalogEligibility } from "@/lib/catalog/visibility-query";
import { filterPublicPracticeRows } from "@/lib/fixtures/test-fixture-marker";
import type { SchoolGraduate } from "@/lib/school/graduates";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";

export const dynamic = "force-dynamic";

export default async function SchoolGraduatesPage() {
  await requireAdminPermission("authors.manage");
  let loaded;
  try {
    const supabase = createServiceRoleClient();
    loaded = await Promise.all([
      fetchAllPages((from, to) => supabase.from("authors").select("id, name").order("id").range(from, to)),
      fetchAllPages((from, to) => supabase.from("school_graduates").select("*").order("position").order("author_id").range(from, to)),
      fetchAllPages((from, to) => applyOrdinaryCatalogEligibility(supabase.from("practices").select("id, title, author_id, slug, cover_image"))
        .is("deleted_at", null).not("author_id", "is", null).not("slug", "is", null).order("id").range(from, to)),
    ]);
  } catch {
    return <p role="alert" className="text-sm text-red-700">Не удалось загрузить выпускников. <a href="/admin/school-graduates" className="underline">Обновить страницу</a>. Если ошибка повторяется, раздел ещё не готов к работе.</p>;
  }
  const [authors, graduates, products] = loaded;
  return <section aria-labelledby="graduates-admin-heading">
      <h2 id="graduates-admin-heading" className="text-xl font-semibold">Выпускники Школы аудиопрактик</h2>
      <p className="mt-2 text-sm text-[#796ba0]">Добавьте существующего автора, отметьте галочкой «Выпускник Школы аудиопрактик» и вручную выберите до двух его опубликованных продуктов. Без галочки или выбранных продуктов автор на сайте не появится.</p>
      <SchoolGraduatesEditor graduates={graduates as SchoolGraduate[]} authors={authors.sort((a, b) => a.name.localeCompare(b.name, "ru"))}
        products={filterPublicPracticeRows(products).map(({ id, title, author_id }) => ({ id, title, author_id })).sort((a, b) => a.title.localeCompare(b.title, "ru"))} />
    </section>;

}
