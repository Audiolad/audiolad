export const TOCHKA_PAYMENT_PURPOSE_MAX_LENGTH = 140;
export const TOCHKA_RECEIPT_ITEM_NAME_MAX_LENGTH = 256;

const BRAND_PREFIX = "АудиоЛад – ";
const ORDER_SUFFIX_PREFIX = " – заказ ";
const STUDIO_MUSIC_LICENSE_PREFIX = "Лицензия для Студии АудиоЛад: ";

function shortOrderId(orderId: string, length = 8): string {
  const normalized = orderId.replace(/-/g, "").toLowerCase();
  return normalized.slice(0, length);
}

function buildPurpose(
  productTitle: string,
  orderSuffix: string,
  prefix = BRAND_PREFIX,
): string {
  return `${prefix}${productTitle}${orderSuffix}`;
}

export function formatTochkaPaymentPurpose(
  orderId: string,
  productTitle: string,
  maxLength = TOCHKA_PAYMENT_PURPOSE_MAX_LENGTH,
  prefix = BRAND_PREFIX,
  preserveOrderSuffix = false,
): string {
  const title = productTitle.trim();

  if (!title) {
    throw new Error("tochka_payment_purpose_title_missing");
  }

  const fullShortId = shortOrderId(orderId, 8);
  const fullOrderSuffix = `${ORDER_SUFFIX_PREFIX}${fullShortId}`;
  let orderSuffix = fullOrderSuffix;
  let purpose = buildPurpose(title, orderSuffix, prefix);

  if (purpose.length <= maxLength) {
    return purpose;
  }

  for (let idLength = 7; idLength >= 4; idLength -= 1) {
    orderSuffix = `${ORDER_SUFFIX_PREFIX}${fullShortId.slice(0, idLength)}`;
    purpose = buildPurpose(title, orderSuffix, prefix);

    if (purpose.length <= maxLength) {
      return purpose;
    }
  }

  if (preserveOrderSuffix) {
    const maxTitleLength = maxLength - prefix.length - fullOrderSuffix.length;
    if (maxTitleLength > 0) {
      return buildPurpose(
        title.slice(0, maxTitleLength).trimEnd(),
        fullOrderSuffix,
        prefix,
      );
    }
  }

  purpose = buildPurpose(title, "", prefix);

  if (purpose.length <= maxLength) {
    return purpose;
  }

  const maxTitleLength = maxLength - prefix.length;

  if (maxTitleLength <= 0) {
    return prefix.trimEnd();
  }

  return buildPurpose(title.slice(0, maxTitleLength).trimEnd(), "", prefix);
}

/**
 * Keeps the Studio license label intact while deterministically shortening
 * only the product title for provider-facing purchase names.
 */
export function formatStudioMusicLicensePurchaseName(
  productTitle: string,
  maxLength = TOCHKA_RECEIPT_ITEM_NAME_MAX_LENGTH,
): string {
  const title = productTitle.trim();

  if (!title) {
    throw new Error("tochka_payment_purpose_title_missing");
  }

  const quotedTitle = `«${title}»`;
  const fullName = `${STUDIO_MUSIC_LICENSE_PREFIX}${quotedTitle}`;
  if (fullName.length <= maxLength) {
    return fullName;
  }

  const maxTitleLength =
    maxLength - STUDIO_MUSIC_LICENSE_PREFIX.length - "«»".length;
  if (maxTitleLength <= 0) {
    return STUDIO_MUSIC_LICENSE_PREFIX.slice(0, maxLength).trimEnd();
  }

  return `${STUDIO_MUSIC_LICENSE_PREFIX}«${title
    .slice(0, maxTitleLength)
    .trimEnd()}»`;
}
