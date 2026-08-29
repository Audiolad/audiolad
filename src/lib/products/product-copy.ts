/**
 * User-facing copy for ordinary product.description and seoAbout.
 * Technical field names stay description / seoAbout.
 */

export const AUTHOR_DESCRIPTION_LABEL = "Короткое описание продукта";
export const AUTHOR_DESCRIPTION_HELPER =
  "Коротко расскажите, что это за продукт и зачем его слушать или использовать. Обычно достаточно 2–4 предложений.";
export const AUTHOR_DESCRIPTION_MISSING_MESSAGE =
  "Добавьте короткое описание продукта.";

export const SEO_ABOUT_LABEL = "Подробнее о продукте";
export const SEO_ABOUT_HELPER =
  "Этот текст появится ниже короткого описания. Не повторяйте его: раскройте тему подробнее – особенности продукта, контекст использования и полезные детали.";
export const SEO_ABOUT_AUTOFILL_HINT =
  "АудиоЛад подготовит этот текст автоматически при генерации SEO.";

export const PUBLIC_SHORT_HEADING = "Коротко о продукте";
export const PUBLIC_DETAIL_HEADING = "Подробнее о продукте";

export type ProductCopySection = {
  heading: string;
  text: string;
};

export type ProductCopySectionsModel = {
  short: ProductCopySection | null;
  detail: ProductCopySection | null;
};

export function resolveProductCopySections(
  description?: string | null,
  seoAbout?: string | null,
): ProductCopySectionsModel {
  const shortText = description?.trim() || "";
  const detailText = seoAbout?.trim() || "";

  return {
    short: shortText
      ? { heading: PUBLIC_SHORT_HEADING, text: shortText }
      : null,
    detail: detailText
      ? { heading: PUBLIC_DETAIL_HEADING, text: detailText }
      : null,
  };
}
