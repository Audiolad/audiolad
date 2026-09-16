"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateCatalogSectionAction } from "@/app/(platform)/admin/catalog-sections/actions";
import type { AdminCatalogSectionProduct } from "@/lib/admin/catalog-sections-queries";
import {
  CATALOG_SECTIONS,
  CATALOG_SECTION_LABELS,
  type CatalogSection,
} from "@/lib/catalog/catalog-sections";

const FORMAT_LABELS: Record<string, string> = {
  meditation: "Медитация",
  energy_practice: "Энергопрактика",
  lecture: "Лекция",
  audio_course: "Аудиокурс",
  podcast: "Подкаст",
  music: "Музыка",
  audiobook: "Аудиокнига",
  session: "Сеанс",
  sleep: "Сон",
  prayer: "Молитва",
  audio_story: "Аудиоистория",
  custom: "Свой формат",
};

function getFormatLabel(format: string | null): string {
  if (!format) {
    return "—";
  }

  return FORMAT_LABELS[format] ?? format;
}

export default function CatalogSectionsTable({
  products,
}: {
  products: AdminCatalogSectionProduct[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, CatalogSection | "">>(
    () =>
      Object.fromEntries(
        products.map((product) => [
          product.id,
          product.catalogSection ?? "",
        ]),
      ),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (products.length === 0) {
    return (
      <div className="rounded-[22px] border border-[#eadff8] bg-white p-8 text-center">
        <p className="text-base font-medium text-[#25135c]">
          В этом фильтре пока нет продуктов.
        </p>
      </div>
    );
  }

  async function handleChange(
    product: AdminCatalogSectionProduct,
    value: string,
  ) {
    const previousValue =
      values[product.id] ?? product.catalogSection ?? "";
    const nextValue = value as CatalogSection | "";

    setValues((current) => ({
      ...current,
      [product.id]: nextValue,
    }));
    setErrors((current) => ({
      ...current,
      [product.id]: "",
    }));
    setSavingId(product.id);

    const result = await updateCatalogSectionAction(
      product.id,
      nextValue || null,
    );

    if (!result.ok) {
      setValues((current) => ({
        ...current,
        [product.id]: previousValue,
      }));
      setErrors((current) => ({
        ...current,
        [product.id]: result.error,
      }));
    } else {
      router.refresh();
    }

    setSavingId((current) => (current === product.id ? null : current));
  }

  return (
    <div className="overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[#eee6f7] bg-[#faf6ff] text-[#796ba0]">
            <tr>
              <th className="w-16 px-4 py-3 font-medium">№</th>
              <th className="px-4 py-3 font-medium">Название</th>
              <th className="px-4 py-3 font-medium">Автор</th>
              <th className="px-4 py-3 font-medium">Формат</th>
              <th className="min-w-[220px] px-4 py-3 font-medium">
                Раздел каталога
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product, index) => (
              <tr
                key={product.id}
                className="border-b border-[#f3edf9] last:border-b-0"
              >
                <td className="px-4 py-4 text-[#796ba0]">
                  {index + 1}
                </td>
                <td className="px-4 py-4 font-medium text-[#25135c]">
                  {product.title}
                </td>
                <td className="px-4 py-4 text-[#796ba0]">
                  <div>{product.authorName}</div>
                  {product.authorSlug ? (
                    <div className="mt-1 text-xs">/{product.authorSlug}</div>
                  ) : null}
                </td>
                <td className="px-4 py-4 text-[#796ba0]">
                  {getFormatLabel(product.format)}
                </td>
                <td className="px-4 py-4">
                  <select
                    value={
                      values[product.id] ?? product.catalogSection ?? ""
                    }
                    disabled={savingId === product.id}
                    onChange={(event) =>
                      void handleChange(product, event.target.value)
                    }
                    className="w-full rounded-xl border border-[#e4d7f4] bg-white px-3 py-2 text-sm text-[#25135c] outline-none focus:border-[#7042c5] disabled:opacity-60"
                  >
                    <option value="">Не выбрано</option>
                    {CATALOG_SECTIONS.map((section) => (
                      <option key={section} value={section}>
                        {CATALOG_SECTION_LABELS[section]}
                      </option>
                    ))}
                  </select>

                  {savingId === product.id ? (
                    <p className="mt-1 text-xs text-[#796ba0]">
                      Сохраняю…
                    </p>
                  ) : null}

                  {errors[product.id] ? (
                    <p className="mt-1 text-xs text-[#b34f63]">
                      {errors[product.id]}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
