import "server-only";

const GETCOURSE_TIMEOUT_MS = 10_000;
const SAFE_ERROR_MESSAGE_MAX_LENGTH = 200;

export type GetCourseConfig = {
  accountName: string;
  apiKey: string;
  appreciationOfferId: string;
};

export type GetCourseDealInput = {
  email: string;
  amountMinor: number;
  localDealNumber: string;
};

export type GetCourseDeal = {
  dealId: string;
  dealNumber: string | null;
  paymentLink: string;
};

type GetCourseSuccessFlag = boolean | null;

type GetCourseDealFailureReason =
  | "http_error"
  | "response_invalid"
  | "logical_error"
  | "response_incomplete"
  | "payment_link_invalid";

type GetCourseDealDiagnosis = {
  reason: GetCourseDealFailureReason;
  http_status: number;
  top_success: GetCourseSuccessFlag;
  result_success: GetCourseSuccessFlag;
  error_flag: boolean | null;
  error_message: string | null;
  deal_id_present: boolean;
  payment_link_present: boolean;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`author_appreciation_getcourse_${name.toLowerCase()}_missing`);
  return value;
}

export function getGetCourseConfig(): GetCourseConfig {
  const accountName = requiredEnvironment("GETCOURSE_ACCOUNT_NAME");
  if (!/^[a-z0-9-]+$/i.test(accountName)) {
    throw new Error("author_appreciation_getcourse_account_name_invalid");
  }

  return {
    accountName,
    apiKey: requiredEnvironment("GETCOURSE_API_KEY"),
    appreciationOfferId: requiredEnvironment("GETCOURSE_APPRECIATION_OFFER_ID"),
  };
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function idField(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return stringField(value);
}

function readSuccessFlag(value: unknown): GetCourseSuccessFlag {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0") return false;
  return null;
}

function readErrorFlag(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0" || value === "") {
    return false;
  }
  if (typeof value === "string" && value.trim()) return true;
  return null;
}

function sanitizeProviderMessage(value: unknown): string | null {
  const text = stringField(value);
  if (!text) return null;
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .slice(0, SAFE_ERROR_MESSAGE_MAX_LENGTH);
}

function emptyDiagnosis(
  httpStatus: number,
  reason: GetCourseDealFailureReason,
): GetCourseDealDiagnosis {
  return {
    reason,
    http_status: httpStatus,
    top_success: null,
    result_success: null,
    error_flag: null,
    error_message: null,
    deal_id_present: false,
    payment_link_present: false,
  };
}

function logDealFailure(diagnosis: GetCourseDealDiagnosis): void {
  console.error("author_appreciation_getcourse_deal_failed", {
    reason: diagnosis.reason,
    http_status: diagnosis.http_status,
    top_success: diagnosis.top_success,
    result_success: diagnosis.result_success,
    error_flag: diagnosis.error_flag,
    error_message: diagnosis.error_message,
    deal_id_present: diagnosis.deal_id_present,
    payment_link_present: diagnosis.payment_link_present,
  });
}

function diagnosePayload(payload: unknown, httpStatus: number): GetCourseDealDiagnosis {
  if (!payload || typeof payload !== "object") {
    return emptyDiagnosis(httpStatus, "response_invalid");
  }

  const record = payload as Record<string, unknown>;
  const result =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : record;
  const dealId = idField(result.deal_id) ?? idField(record.deal_id);
  const paymentLink =
    stringField(result.payment_link) ??
    stringField(result.payment_url) ??
    stringField(record.payment_link);
  const errorMessage =
    sanitizeProviderMessage(result.error_message) ??
    sanitizeProviderMessage(record.error_message) ??
    sanitizeProviderMessage(typeof result.error === "string" ? result.error : null) ??
    sanitizeProviderMessage(typeof record.error === "string" ? record.error : null);

  return {
    reason: "response_incomplete",
    http_status: httpStatus,
    top_success: readSuccessFlag(record.success),
    result_success: readSuccessFlag(result.success),
    error_flag: readErrorFlag(result.error) ?? readErrorFlag(record.error),
    error_message: errorMessage,
    deal_id_present: Boolean(dealId),
    payment_link_present: Boolean(paymentLink),
  };
}

function parseDealResponse(payload: unknown, httpStatus: number): GetCourseDeal {
  const diagnosis = diagnosePayload(payload, httpStatus);
  if (diagnosis.reason === "response_invalid") {
    logDealFailure(diagnosis);
    throw new Error("author_appreciation_getcourse_response_invalid");
  }

  const explicitLogicalFailure =
    diagnosis.top_success === false ||
    diagnosis.result_success === false ||
    (diagnosis.error_flag === true && !diagnosis.payment_link_present);

  if (explicitLogicalFailure) {
    logDealFailure({ ...diagnosis, reason: "logical_error" });
    throw new Error("author_appreciation_getcourse_logical_error");
  }

  if (!payload || typeof payload !== "object") {
    logDealFailure({ ...diagnosis, reason: "response_invalid" });
    throw new Error("author_appreciation_getcourse_response_invalid");
  }

  const record = payload as Record<string, unknown>;
  const result =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : record;
  const dealId = idField(result.deal_id) ?? idField(record.deal_id);
  const paymentLink =
    stringField(result.payment_link) ??
    stringField(result.payment_url) ??
    stringField(record.payment_link);
  const dealNumber =
    idField(result.deal_number) ?? idField(record.deal_number);

  if (!dealId || !paymentLink) {
    logDealFailure({ ...diagnosis, reason: "response_incomplete" });
    throw new Error("author_appreciation_getcourse_response_incomplete");
  }
  try {
    const url = new URL(paymentLink);
    if (url.protocol !== "https:") throw new Error("invalid_protocol");
  } catch {
    logDealFailure({ ...diagnosis, reason: "payment_link_invalid" });
    throw new Error("author_appreciation_getcourse_payment_link_invalid");
  }
  return { dealId, dealNumber, paymentLink };
}

export async function createGetCourseAppreciationDeal(
  config: GetCourseConfig,
  input: GetCourseDealInput,
  fetchImpl: typeof fetch = fetch,
): Promise<GetCourseDeal> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("author_appreciation_getcourse_amount_invalid");
  }
  // GetCourse documents deal_cost as whole roubles. Stage 3A accepts only
  // whole-rouble amounts, so this conversion never rounds a payer's amount.
  if (input.amountMinor % 100 !== 0) {
    throw new Error("author_appreciation_getcourse_amount_not_whole_rubles");
  }

  const params = {
    user: { email: input.email },
    system: {
      refresh_if_exists: 0,
      return_payment_link: 1,
      return_deal_number: 1,
    },
    deal: {
      offer_id: config.appreciationOfferId,
      deal_cost: input.amountMinor / 100,
      deal_number: input.localDealNumber,
    },
  };
  const form = new URLSearchParams({
    action: "add",
    key: config.apiKey,
    params: Buffer.from(JSON.stringify(params), "utf8").toString("base64"),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GETCOURSE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(
      `https://${config.accountName}.getcourse.ru/pl/api/deals`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: controller.signal,
      },
    );

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const diagnosis = diagnosePayload(payload, response.status);
      logDealFailure({ ...diagnosis, reason: "http_error" });
      throw new Error("author_appreciation_getcourse_request_failed");
    }
    if (payload === null) {
      logDealFailure(emptyDiagnosis(response.status, "response_invalid"));
      throw new Error("author_appreciation_getcourse_response_invalid");
    }
    return parseDealResponse(payload, response.status);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("author_appreciation_getcourse_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
