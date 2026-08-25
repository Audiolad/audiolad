"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AUTHOR_PUBLICATION_CLASS_LABELS,
  CABINET_BRANCH,
  CABINET_BRANCH_LABELS,
  type CabinetBranch,
  type ProductPublicationClass,
} from "@/lib/author-products/publication-class";

const BRANCH_OPTIONS: Array<{
  value: CabinetBranch;
  description: string;
}> = [
  {
    value: CABINET_BRANCH.PRODUCT,
    description: "Аудиопрактика, аудиокурс или аудиокнига.",
  },
  {
    value: CABINET_BRANCH.MUSIC,
    description: "Отдельный трек или альбом из нескольких аудиофайлов.",
  },
  {
    value: CABINET_BRANCH.POST,
    description:
      "Бесплатный аудиоматериал с возможной рекомендацией после прослушивания.",
  },
];

const PRODUCT_OPTIONS: Array<{
  value: ProductPublicationClass;
  description: string;
}> = [
  {
    value: "practice",
    description: "Медитации, практики, программы и другие аудиоматериалы.",
  },
  {
    value: "course",
    description: "Курс из нескольких материалов в одной публикации.",
  },
  {
    value: "audiobook",
    description: "Аудиокнига как отдельный продукт.",
  },
];

function buildCreateHref(
  publicationClass: string,
  authorSlug?: string,
): string {
  const params = new URLSearchParams();
  params.set("class", publicationClass);

  if (authorSlug) {
    params.set("author", authorSlug);
  }

  return `/author-dashboard/products/new?${params.toString()}`;
}

export default function AuthorCreateWizard({
  authorSlug,
}: {
  authorSlug?: string;
}) {
  const router = useRouter();
  const [branch, setBranch] = useState<CabinetBranch | null>(null);

  const title = useMemo(() => {
    if (branch === CABINET_BRANCH.PRODUCT) {
      return "Какой продукт создать?";
    }

    return "Что создать?";
  }, [branch]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#25135c]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f5484]">
          {branch === CABINET_BRANCH.PRODUCT
            ? "Выберите тип продукта. Разделы, главы и галерея появятся позже."
            : "Сначала выберите ветку. Тип публикации сохранится в карточке."}
        </p>
      </div>

      {branch === CABINET_BRANCH.PRODUCT ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {PRODUCT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                router.push(buildCreateHref(option.value, authorSlug))
              }
              className="rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-4 text-left transition hover:border-[#9a74d8] hover:bg-[#f8f4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <span className="block text-sm font-medium text-[#3f3560]">
                {AUTHOR_PUBLICATION_CLASS_LABELS[option.value]}
              </span>
              <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {BRANCH_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (option.value === CABINET_BRANCH.PRODUCT) {
                  setBranch(CABINET_BRANCH.PRODUCT);
                  return;
                }

                router.push(
                  buildCreateHref(
                    option.value === CABINET_BRANCH.MUSIC
                      ? "release"
                      : "post",
                    authorSlug,
                  ),
                );
              }}
              className="rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-4 text-left transition hover:border-[#9a74d8] hover:bg-[#f8f4ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <span className="block text-sm font-medium text-[#3f3560]">
                {CABINET_BRANCH_LABELS[option.value]}
              </span>
              <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {branch === CABINET_BRANCH.PRODUCT ? (
        <button
          type="button"
          onClick={() => setBranch(null)}
          className="text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline"
        >
          Назад к выбору ветки
        </button>
      ) : null}
    </div>
  );
}
