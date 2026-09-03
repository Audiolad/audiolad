import { NextResponse } from "next/server";

import { parseGetCourseCallback } from "@/lib/author-appreciation/getcourse/callback";
import { handleGetCourseAppreciationCallback } from "@/lib/author-appreciation/getcourse/handle-callback";
import { getGetCourseConfig } from "@/lib/author-appreciation/getcourse/provider";
import { scheduleGetCourseAppreciationReconcile } from "@/lib/author-appreciation/getcourse/reconcile";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export { parseGetCourseCallback };

export async function POST(request: Request) {
  const expectedSecret = process.env.GETCOURSE_CALLBACK_SECRET?.trim();
  const contentType = request.headers.get("content-type");
  const secretHeader = request.headers.get("x-audiolad-getcourse-secret");

  let payload: unknown = null;
  if (expectedSecret && secretHeader && contentType?.toLowerCase().includes("application/json")) {
    try {
      payload = await request.json();
    } catch {
      return new NextResponse(null, { status: 400 });
    }
  }

  let configuredOfferId = "";
  try {
    configuredOfferId = getGetCourseConfig().appreciationOfferId;
  } catch {
    configuredOfferId = "";
  }

  const result = await handleGetCourseAppreciationCallback({
    secretHeader,
    expectedSecret,
    contentType,
    payload,
    configuredOfferId,
    rpc: async (args) => {
      const config = getGetCourseConfig();
      const service = createServiceRoleClient();
      return service.rpc("apply_author_appreciation_getcourse_callback", {
        p_provider_deal_id: args.p_provider_deal_id,
        p_provider_deal_number: args.p_provider_deal_number,
        p_offer_id: args.p_offer_id || config.appreciationOfferId,
        p_amount_minor: args.p_amount_minor,
        p_status: args.p_status,
        p_payed_money_minor: args.p_payed_money_minor,
        p_left_cost_money_minor: args.p_left_cost_money_minor,
      });
    },
  });

  if (result.status === 200 && result.rpcCalled && result.ignoredReason === null) {
    scheduleGetCourseAppreciationReconcile();
  }

  return new NextResponse(null, { status: result.status });
}
