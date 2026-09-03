import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getGetCourseConfig } from "@/lib/author-appreciation/getcourse/provider";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type Json = Record<string, unknown>;

function safeEqual(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);
}

function record(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  }
  return null;
}

function extractOfferIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const item = record(entry);
      const found = firstString(item?.offer_id, item?.id, entry);
      return found ? [found] : [];
    });
  }
  const found = firstString(value);
  return found ? [found] : [];
}

function rublesToMinor(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value * 100;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const wholeRubles = Number(value.trim());
  return Number.isSafeInteger(wholeRubles) ? wholeRubles * 100 : null;
}

export function parseGetCourseCallback(payload: unknown) {
  const root = record(payload);
  const data = record(root?.data);
  const deal = record(root?.deal) ?? record(data?.deal);
  const offerIds = extractOfferIds(
    deal?.offer_id ?? deal?.offer_ids ?? root?.offer_id ?? root?.offer_ids ?? data?.offer_id ?? data?.offer_ids,
  );
  return {
    dealId: firstString(deal?.id, deal?.deal_id, root?.deal_id, data?.deal_id),
    dealNumber: firstString(
      deal?.number,
      deal?.deal_number,
      root?.deal_number,
      data?.deal_number,
    ),
    offerId: offerIds[0] ?? null,
    offerIds,
    amountMinor: rublesToMinor(
      deal?.deal_cost ?? deal?.cost ?? root?.deal_cost ?? root?.amount ?? data?.deal_cost ?? data?.amount,
    ),
    status: firstString(
      deal?.status,
      deal?.deal_status,
      root?.status,
      data?.status,
    ),
    payedMoneyMinor: rublesToMinor(
      deal?.payed_money ?? root?.payed_money ?? data?.payed_money,
    ),
    leftCostMoneyMinor: rublesToMinor(
      deal?.left_cost_money ?? root?.left_cost_money ?? data?.left_cost_money,
    ),
  };
}

export async function POST(request: Request) {
  const expectedSecret = process.env.GETCOURSE_CALLBACK_SECRET?.trim();
  if (!expectedSecret) return new NextResponse(null, { status: 500 });
  if (!safeEqual(request.headers.get("x-audiolad-getcourse-secret"), expectedSecret)) {
    return new NextResponse(null, { status: 401 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return new NextResponse(null, { status: 415 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const callback = parseGetCourseCallback(payload);
  if (
    (!callback.dealId && !callback.dealNumber) ||
    !callback.offerId ||
    callback.amountMinor === null ||
    callback.status !== "payed"
  ) {
    return new NextResponse(null, { status: 200 });
  }

  // Confirm the offer configuration is present, without logging it or any
  // callback contents. The RPC performs the row lock and all state changes.
  try {
    const config = getGetCourseConfig();
    const offerId = callback.offerIds.includes(config.appreciationOfferId)
      ? config.appreciationOfferId
      : callback.offerId;
    const service = createServiceRoleClient();
    const { error } = await service.rpc("apply_author_appreciation_getcourse_callback", {
      p_provider_deal_id: callback.dealId,
      p_provider_deal_number: callback.dealNumber,
      p_offer_id: offerId,
      p_amount_minor: callback.amountMinor,
      p_status: callback.status,
      p_payed_money_minor: callback.payedMoneyMinor,
      p_left_cost_money_minor: callback.leftCostMoneyMinor,
    });
    return new NextResponse(null, { status: error ? 500 : 200 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
