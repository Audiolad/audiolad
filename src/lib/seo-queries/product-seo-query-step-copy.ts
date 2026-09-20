/**
 * Pre-create SEO query step copy, keyed by publication class.
 * Pure display helper — no flow or reservation logic.
 */
export type ProductSeoQueryStepCopy = {
  title: string;
  description: string;
};

export function getProductSeoQueryStepCopy(
  publicationClass: string | null | undefined,
): ProductSeoQueryStepCopy {
  if (publicationClass?.trim() === "release") {
    return {
      title: "Выберите поисковый запрос для музыки",
      description:
        "Подберите запрос, под который вы создаёте музыку. Он будет связан с продуктом и станет его основным поисковым запросом.",
    };
  }
  return {
    title: "Выберите поисковый запрос",
    description:
      "Подберите запрос, под который вы создаёте аудиопродукт. Он будет связан с продуктом и станет его основным поисковым запросом.",
  };
}
