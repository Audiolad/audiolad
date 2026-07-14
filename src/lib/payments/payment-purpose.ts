export const TOCHKA_PAYMENT_PURPOSE_MAX_LENGTH = 140;

const BRAND_PREFIX = "АудиоЛад – ";
const ORDER_SUFFIX_PREFIX = " – заказ ";

function shortOrderId(orderId: string, length = 8): string {
  const normalized = orderId.replace(/-/g, "").toLowerCase();
  return normalized.slice(0, length);
}

function buildPurpose(
  productTitle: string,
  orderSuffix: string,
): string {
  return `${BRAND_PREFIX}${productTitle}${orderSuffix}`;
}

export function formatTochkaPaymentPurpose(
  orderId: string,
  productTitle: string,
  maxLength = TOCHKA_PAYMENT_PURPOSE_MAX_LENGTH,
): string {
  const title = productTitle.trim();

  if (!title) {
    throw new Error("tochka_payment_purpose_title_missing");
  }

  const fullShortId = shortOrderId(orderId, 8);
  let orderSuffix = `${ORDER_SUFFIX_PREFIX}${fullShortId}`;
  let purpose = buildPurpose(title, orderSuffix);

  if (purpose.length <= maxLength) {
    return purpose;
  }

  for (let idLength = 7; idLength >= 4; idLength -= 1) {
    orderSuffix = `${ORDER_SUFFIX_PREFIX}${fullShortId.slice(0, idLength)}`;
    purpose = buildPurpose(title, orderSuffix);

    if (purpose.length <= maxLength) {
      return purpose;
    }
  }

  purpose = buildPurpose(title, "");

  if (purpose.length <= maxLength) {
    return purpose;
  }

  const maxTitleLength = maxLength - BRAND_PREFIX.length;

  if (maxTitleLength <= 0) {
    return BRAND_PREFIX.trimEnd();
  }

  return buildPurpose(title.slice(0, maxTitleLength).trimEnd(), "");
}
