/**
 * User-facing copy for the public product description block.
 * Technical field name stays `description`. Legacy `seoAbout` is inert.
 */

export const AUTHOR_DESCRIPTION_LABEL = "О продукте";
export const AUTHOR_DESCRIPTION_HELPER =
  "Расскажите, что это за продукт, для кого он, что в нём происходит и зачем его слушать или использовать. До 1000 символов.";
export const AUTHOR_DESCRIPTION_MISSING_MESSAGE =
  "Добавьте описание продукта.";

export const PUBLIC_PRODUCT_DESCRIPTION_HEADING = "О продукте";

export type ProductCopySection = {
  heading: string;
  text: string;
};

export type ProductCopySectionsModel = {
  about: ProductCopySection | null;
};

export function resolveProductCopySections(
  description?: string | null,
): ProductCopySectionsModel {
  const text = description?.trim() || "";

  return {
    about: text
      ? { heading: PUBLIC_PRODUCT_DESCRIPTION_HEADING, text }
      : null,
  };
}
