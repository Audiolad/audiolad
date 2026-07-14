export type TochkaPaymentMode = "sbp" | "card" | "tinkoff" | "dolyame";

/** OpenAPI TaxSystemCodeInput — ПСН = patent */
export type TochkaTaxSystemCode =
  | "osn"
  | "usn_income"
  | "usn_income_outcome"
  | "esn"
  | "patent";

/** OpenAPI VatType — без НДС = none */
export type TochkaVatType =
  | "none"
  | "vat0"
  | "vat5"
  | "vat7"
  | "vat10"
  | "vat22"
  | "vat105"
  | "vat107"
  | "vat110"
  | "vat122";

/** OpenAPI PaymentMethod — полная оплата = full_payment */
export type TochkaReceiptPaymentMethod = "full_payment" | "full_prepayment";

/** OpenAPI PaymentObject — услуга = service */
export type TochkaReceiptPaymentObject = "goods" | "service" | "work";

export type TochkaConfig = {
  apiBaseUrl: string;
  jwtToken: string;
  customerCode: string;
  merchantId: string | null;
  clientId: string;
  paymentModes: TochkaPaymentMode[];
  useReceipt: boolean;
  taxSystemCode: TochkaTaxSystemCode | null;
  receiptVatType: TochkaVatType | null;
  receiptPaymentMethod: TochkaReceiptPaymentMethod;
  receiptPaymentObject: TochkaReceiptPaymentObject;
  siteUrl: string;
};

const DEFAULT_API_BASE_URL = "https://enter.tochka.com/uapi";
const DEFAULT_PAYMENT_MODES: TochkaPaymentMode[] = ["card", "sbp"];
const DEFAULT_RECEIPT_PAYMENT_METHOD: TochkaReceiptPaymentMethod = "full_payment";
const DEFAULT_RECEIPT_PAYMENT_OBJECT: TochkaReceiptPaymentObject = "service";

const TAX_SYSTEM_CODES = new Set<TochkaTaxSystemCode>([
  "osn",
  "usn_income",
  "usn_income_outcome",
  "esn",
  "patent",
]);

const VAT_TYPES = new Set<TochkaVatType>([
  "none",
  "vat0",
  "vat5",
  "vat7",
  "vat10",
  "vat22",
  "vat105",
  "vat107",
  "vat110",
  "vat122",
]);

const RECEIPT_PAYMENT_METHODS = new Set<TochkaReceiptPaymentMethod>([
  "full_payment",
  "full_prepayment",
]);

const RECEIPT_PAYMENT_OBJECTS = new Set<TochkaReceiptPaymentObject>([
  "goods",
  "service",
  "work",
]);

function parsePaymentModes(raw: string | undefined): TochkaPaymentMode[] {
  if (!raw || raw.trim() === "") {
    return DEFAULT_PAYMENT_MODES;
  }

  const allowed = new Set<TochkaPaymentMode>([
    "sbp",
    "card",
    "tinkoff",
    "dolyame",
  ]);

  const modes = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is TochkaPaymentMode =>
      allowed.has(value as TochkaPaymentMode),
    );

  return modes.length > 0 ? modes : DEFAULT_PAYMENT_MODES;
}

function parseEnumValue<T extends string>(
  raw: string | undefined,
  allowed: Set<T>,
): T | null {
  if (!raw || raw.trim() === "") {
    return null;
  }

  const value = raw.trim() as T;
  return allowed.has(value) ? value : null;
}

export function getTochkaConfig(): TochkaConfig | null {
  const jwtToken = process.env.TOCHKA_JWT_TOKEN?.trim();
  const customerCode = process.env.TOCHKA_CUSTOMER_CODE?.trim();
  const clientId = process.env.TOCHKA_CLIENT_ID?.trim();

  if (!jwtToken || !customerCode || !clientId) {
    return null;
  }

  const merchantId = process.env.TOCHKA_MERCHANT_ID?.trim() || null;
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    "https://audiolad.ru";

  const useReceipt = process.env.TOCHKA_USE_RECEIPT === "true";

  const taxSystemCode = parseEnumValue(
    process.env.TOCHKA_TAX_SYSTEM_CODE,
    TAX_SYSTEM_CODES,
  );
  const receiptVatType = parseEnumValue(
    process.env.TOCHKA_RECEIPT_VAT_TYPE,
    VAT_TYPES,
  );
  const receiptPaymentMethod =
    parseEnumValue(
      process.env.TOCHKA_RECEIPT_PAYMENT_METHOD,
      RECEIPT_PAYMENT_METHODS,
    ) ?? DEFAULT_RECEIPT_PAYMENT_METHOD;
  const receiptPaymentObject =
    parseEnumValue(
      process.env.TOCHKA_RECEIPT_PAYMENT_OBJECT,
      RECEIPT_PAYMENT_OBJECTS,
    ) ?? DEFAULT_RECEIPT_PAYMENT_OBJECT;

  if (useReceipt) {
    if (!taxSystemCode || !receiptVatType) {
      return null;
    }

    if (receiptPaymentObject !== "service") {
      return null;
    }

    if (receiptPaymentMethod !== "full_payment") {
      return null;
    }
  }

  return {
    apiBaseUrl:
      process.env.TOCHKA_API_BASE_URL?.trim().replace(/\/$/, "") ||
      DEFAULT_API_BASE_URL,
    jwtToken,
    customerCode,
    merchantId,
    clientId,
    paymentModes: parsePaymentModes(process.env.TOCHKA_PAYMENT_MODES),
    useReceipt,
    taxSystemCode,
    receiptVatType,
    receiptPaymentMethod,
    receiptPaymentObject,
    siteUrl,
  };
}

export function minorToRubles(amountMinor: number): number {
  return Number((amountMinor / 100).toFixed(2));
}

export function isTochkaEnvVarConfigured(name: string): boolean {
  const value = process.env[name]?.trim();
  return Boolean(value);
}
