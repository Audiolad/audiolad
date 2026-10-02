"use client";

import { useRouter } from "next/navigation";

import {
  CABINET_BRANCH,
  CABINET_BRANCH_LABELS,
  type CabinetBranch,
} from "@/lib/author-products/publication-class";
import { buildAuthorProductCreateHref } from "@/lib/seo-queries/reservation-product-create-href";

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

function buildCreateHref(input: {
  publicationClass: string;
  authorSlug?: string;
  seoReservationId?: string;
}): string {
  return buildAuthorProductCreateHref({
    authorSlug: input.authorSlug,
    publicationClass: input.publicationClass,
    reservationId: input.seoReservationId,
  });
}

export default function AuthorCreateWizard({
  authorSlug,
  seoReservationId,
}: {
  authorSlug?: string;
  seoReservationId?: string;
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#25135c]">Что создать?</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f5484]">
          Сначала выберите ветку. Тип публикации сохранится в карточке.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {BRANCH_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              router.push(
                buildCreateHref({
                  // Product opens the unified product flow immediately.
                  // Practice is the entry class; the final product type is chosen
                  // once inside the "Основное" step of AuthorProductForm.
                  publicationClass:
                    option.value === CABINET_BRANCH.PRODUCT
                      ? "practice"
                      : option.value === CABINET_BRANCH.MUSIC
                        ? "release"
                        : "post",
                  authorSlug,
                  seoReservationId,
                }),
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
    </div>
  );
}
