import { buildCheckoutResultQuery } from "@/lib/payments/checkout-token";
import {
  getTochkaConfig,
  minorToRubles,
  type TochkaConfig,
  type TochkaPaymentMode,
  type TochkaReceiptPaymentMethod,
  type TochkaReceiptPaymentObject,
  type TochkaTaxSystemCode,
  type TochkaVatType,
} from "@/lib/payments/tochka-config";

export type CreateTochkaPaymentInput = {
  orderId: string;
  checkoutToken: string;
  amountMinor: number;
  purpose: string;
  consumerId: string;
  customerEmail: string;
  itemName: string;
};

export type CreateTochkaPaymentResult = {
  operationId: string;
  paymentLink: string;
  paymentLinkId: string;
  status: string;
  rawResponse: Record<string, unknown>;
};

type TochkaReceiptItem = {
  name: string;
  amount: number;
  quantity: number;
  paymentMethod: TochkaReceiptPaymentMethod;
  paymentObject: TochkaReceiptPaymentObject;
  vatType: TochkaVatType;
};

type TochkaCreatePaymentData = {
  customerCode: string;
  amount: number;
  purpose: string;
  paymentMode: TochkaPaymentMode[];
  paymentLinkId: string;
  redirectUrl: string;
  failRedirectUrl: string;
  consumerId: string;
  merchantId?: string;
  taxSystemCode?: TochkaTaxSystemCode;
  Client?: {
    email: string;
  };
  Items?: TochkaReceiptItem[];
};

function buildReceiptItem(
  config: TochkaConfig,
  itemName: string,
  unitAmountRubles: number,
): TochkaReceiptItem {
  if (!config.receiptVatType) {
    throw new Error("tochka_receipt_vat_type_missing");
  }

  return {
    name: itemName.slice(0, 256),
    amount: unitAmountRubles,
    quantity: 1,
    paymentMethod: config.receiptPaymentMethod,
    paymentObject: config.receiptPaymentObject,
    vatType: config.receiptVatType,
  };
}

function assertReceiptAmountsConsistent(
  paymentAmountRubles: number,
  items: TochkaReceiptItem[],
): void {
  const itemsTotal = items.reduce(
    (sum, item) => sum + Number((item.amount * item.quantity).toFixed(2)),
    0,
  );

  if (Number(itemsTotal.toFixed(2)) !== Number(paymentAmountRubles.toFixed(2))) {
    throw new Error("tochka_receipt_amount_mismatch");
  }
}

function buildCreatePaymentData(
  config: TochkaConfig,
  input: CreateTochkaPaymentInput,
): TochkaCreatePaymentData {
  const amount = minorToRubles(input.amountMinor);
  const checkoutQuery = buildCheckoutResultQuery(
    input.orderId,
    input.checkoutToken,
  );
  const redirectUrl = `${config.siteUrl}/checkout/result?${checkoutQuery}`;
  const failRedirectUrl = `${config.siteUrl}/checkout/result?${buildCheckoutResultQuery(input.orderId, input.checkoutToken, { status: "failed" })}`;

  const data: TochkaCreatePaymentData = {
    customerCode: config.customerCode,
    amount,
    purpose: input.purpose.slice(0, 140),
    paymentMode: config.paymentModes,
    paymentLinkId: input.orderId,
    redirectUrl,
    failRedirectUrl,
    consumerId: input.consumerId,
  };

  if (config.merchantId) {
    data.merchantId = config.merchantId;
  }

  if (config.useReceipt) {
    if (!config.taxSystemCode || !config.receiptVatType) {
      throw new Error("tochka_receipt_config_incomplete");
    }

    const receiptItem = buildReceiptItem(
      config,
      input.itemName,
      amount,
    );

    assertReceiptAmountsConsistent(amount, [receiptItem]);

    data.taxSystemCode = config.taxSystemCode;
    data.Client = {
      email: input.customerEmail,
    };
    data.Items = [receiptItem];
  }

  return data;
}

function extractDataObject(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  const data = payload.Data;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  return data as Record<string, unknown>;
}

export async function createTochkaPaymentOperation(
  input: CreateTochkaPaymentInput,
): Promise<CreateTochkaPaymentResult> {
  const config = getTochkaConfig();

  if (!config) {
    throw new Error("tochka_not_configured");
  }

  const endpoint = config.useReceipt
    ? "/acquiring/v1.0/payments_with_receipt"
    : "/acquiring/v1.0/payments";

  const response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.jwtToken}`,
    },
    body: JSON.stringify({
      Data: buildCreatePaymentData(config, input),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok || !payload) {
    throw new Error("tochka_create_payment_failed");
  }

  const data = extractDataObject(payload);
  const operationId =
    typeof data?.operationId === "string" ? data.operationId : null;
  const paymentLink =
    typeof data?.paymentLink === "string" ? data.paymentLink : null;
  const paymentLinkId =
    typeof data?.paymentLinkId === "string" ? data.paymentLinkId : input.orderId;
  const status = typeof data?.status === "string" ? data.status : "CREATED";

  if (!operationId || !paymentLink) {
    throw new Error("tochka_create_payment_invalid_response");
  }

  return {
    operationId,
    paymentLink,
    paymentLinkId,
    status,
    rawResponse: payload,
  };
}

export async function getTochkaPaymentOperationInfo(
  operationId: string,
): Promise<Record<string, unknown> | null> {
  const config = getTochkaConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(
    `${config.apiBaseUrl}/acquiring/v1.0/payments/${encodeURIComponent(operationId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.jwtToken}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!payload) {
    return null;
  }

  return extractDataObject(payload);
}
