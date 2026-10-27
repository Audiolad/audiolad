import { requireAdminPermission } from "@/lib/admin/guard";
import { loadManagedCatalogPromo } from "@/lib/catalog/managed-promo";
import { parseManagedCatalogPromo } from "@/lib/catalog/catalog-promo";
import { createClient } from "@/lib/supabase/server";
import CatalogPromoCarousel from "@/components/catalog/CatalogPromoCarousel";
import { savePromoBanner } from "./actions";

export const dynamic = "force-dynamic";

export default async function PromoBannerPage({ searchParams }: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPermission("settings.manage");
  const { status } = await searchParams;
  let promo;
  try {
    promo = parseManagedCatalogPromo(await loadManagedCatalogPromo(await createClient()));
  } catch {
    return <p role="alert">Не удалось загрузить промобаннер. Проверьте доступность базы и применение миграции промобаннера.</p>;
  }
  const fields = [
    { name: "title", label: "Заголовок", maxLength: 120 },
    { name: "caption", label: "Подпись", maxLength: 240 },
    { name: "image", label: "Изображение – путь на сайте или HTTPS URL", maxLength: 2048 },
    { name: "href", label: "Ссылка – путь на сайте или HTTPS URL на домене АудиоЛада", maxLength: 2048 },
  ] as const;
  return <section className="max-w-3xl space-y-5">
    <h2 className="text-xl font-semibold">Промобаннер каталога</h2>
    <p className="text-sm text-[#796ba0]">В сетке каталога после первых 12 продуктов, для гостей и вошедших пользователей. При поиске и фильтрации баннер скрыт. Фото школы показывается целиком на всю ширину ряда, без обрезки и без повторного заголовка.</p>
    {status === "saved" ? <p role="status">Изменения сохранены.</p> : null}
    {status === "invalid" ? <p role="alert">Проверьте поля. Нужны заголовок, изображение и безопасная ссылка на сайт АудиоЛада.</p> : null}
    {status === "error" ? <p role="alert">Не удалось сохранить баннер. Попробуйте снова.</p> : null}
    <form action={savePromoBanner} className="space-y-4">
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="enabled" defaultChecked={promo?.enabled ?? false} />
        Показывать баннер
      </label>
      {fields.map(({ name, label, maxLength }) => <label key={name} className="block text-sm">
        <span className="mb-2 block">{label}</span>
        <input name={name} defaultValue={promo?.[name] ?? ""} maxLength={maxLength}
          required={name !== "caption"} className="min-h-11 w-full rounded-xl border border-[#ddcfef] p-3" />
      </label>)}
      <button type="submit" className="min-h-11 rounded-full bg-[#7042c5] px-6 py-2 text-white">Сохранить</button>
    </form>
    {promo ? <div>
      <h3 className="font-semibold">Сохранённый баннер{promo.enabled ? "" : " (выключен)"}</h3>
      <CatalogPromoCarousel promos={[{ ...promo, alt: "", position: 1 }]} />
    </div> : null}
  </section>;
}
