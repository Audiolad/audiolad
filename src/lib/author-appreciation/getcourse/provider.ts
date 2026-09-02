import "server-only";

const GETCOURSE_TIMEOUT_MS = 10_000;

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

function parseDealResponse(payload: unknown): GetCourseDeal {
  if (!payload || typeof payload !== "object") {
    throw new Error("author_appreciation_getcourse_response_invalid");
  }
  const record = payload as Record<string, unknown>;
  const result =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : record;
  const dealId = stringField(result.deal_id) ?? stringField(record.deal_id);
  const paymentLink =
    stringField(result.payment_link) ??
    stringField(result.payment_url) ??
    stringField(record.payment_link);
  const dealNumber = stringField(result.deal_number) ?? stringField(record.deal_number);

  if (!dealId || !paymentLink) {
    throw new Error("author_appreciation_getcourse_response_incomplete");
  }
  try {
    const url = new URL(paymentLink);
    if (url.protocol !== "https:") throw new Error("invalid_protocol");
  } catch {
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
    if (!response.ok) {
      throw new Error("author_appreciation_getcourse_request_failed");
    }
    return parseDealResponse(await response.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("author_appreciation_getcourse_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
