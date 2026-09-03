import { timingSafeEqual } from "node:crypto";

import {
  decideGetCourseCallbackApply,
  logGetCourseCallbackIgnored,
  parseGetCourseCallback,
  readCallbackRpcOutcome,
  type GetCourseCallbackIgnoreReason,
  type ParsedGetCourseCallback,
} from "@/lib/author-appreciation/getcourse/callback";

export type ApplyGetCourseCallbackRpc = (args: {
  p_provider_deal_id: string | null;
  p_provider_deal_number: string | null;
  p_offer_id: string;
  p_amount_minor: number;
  p_status: string;
  p_payed_money_minor: number | null;
  p_left_cost_money_minor: number | null;
}) => Promise<{ error: { message?: string } | null; data: unknown }>;

export type HandleGetCourseCallbackInput = {
  secretHeader: string | null;
  expectedSecret: string | undefined;
  contentType: string | null;
  payload: unknown;
  configuredOfferId: string;
  rpc: ApplyGetCourseCallbackRpc;
};

export type HandleGetCourseCallbackResult = {
  status: number;
  ignoredReason: GetCourseCallbackIgnoreReason | null;
  rpcCalled: boolean;
  usedDealCorrelation: boolean;
  callback: ParsedGetCourseCallback | null;
};

function safeEqual(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);
}

export function handleGetCourseAppreciationCallback(
  input: HandleGetCourseCallbackInput,
): HandleGetCourseCallbackResult | Promise<HandleGetCourseCallbackResult> {
  if (!input.expectedSecret) {
    return {
      status: 500,
      ignoredReason: null,
      rpcCalled: false,
      usedDealCorrelation: false,
      callback: null,
    };
  }
  if (!safeEqual(input.secretHeader, input.expectedSecret)) {
    return {
      status: 401,
      ignoredReason: null,
      rpcCalled: false,
      usedDealCorrelation: false,
      callback: null,
    };
  }
  if (!input.contentType?.toLowerCase().includes("application/json")) {
    return {
      status: 415,
      ignoredReason: null,
      rpcCalled: false,
      usedDealCorrelation: false,
      callback: null,
    };
  }

  const callback = parseGetCourseCallback(input.payload);
  const decision = decideGetCourseCallbackApply({
    callback,
    configuredOfferId: input.configuredOfferId,
  });
  if (decision.action === "ignore") {
    logGetCourseCallbackIgnored(decision.reason, callback);
    return {
      status: 200,
      ignoredReason: decision.reason,
      rpcCalled: false,
      usedDealCorrelation: false,
      callback,
    };
  }

  return Promise.resolve()
    .then(() =>
      input.rpc({
        p_provider_deal_id: decision.args.providerDealId,
        p_provider_deal_number: decision.args.providerDealNumber,
        p_offer_id: decision.args.offerId,
        p_amount_minor: decision.args.amountMinor,
        p_status: decision.args.status,
        p_payed_money_minor: decision.args.payedMoneyMinor,
        p_left_cost_money_minor: decision.args.leftCostMoneyMinor,
      }),
    )
    .then((result) => {
      if (result.error) {
        return {
          status: 500,
          ignoredReason: null,
          rpcCalled: true,
          usedDealCorrelation: decision.usedDealCorrelation,
          callback,
        };
      }
      const outcome = readCallbackRpcOutcome(result.data);
      const unknownDeal: GetCourseCallbackIgnoreReason = "unknown_deal";
      if (outcome === "unknown") {
        logGetCourseCallbackIgnored(unknownDeal, callback);
        return {
          status: 200,
          ignoredReason: unknownDeal,
          rpcCalled: true,
          usedDealCorrelation: decision.usedDealCorrelation,
          callback,
        };
      }
      return {
        status: 200,
        ignoredReason: null,
        rpcCalled: true,
        usedDealCorrelation: decision.usedDealCorrelation,
        callback,
      };
    })
    .catch(() => ({
      status: 500,
      ignoredReason: null,
      rpcCalled: true,
      usedDealCorrelation: decision.usedDealCorrelation,
      callback,
    }));
}
