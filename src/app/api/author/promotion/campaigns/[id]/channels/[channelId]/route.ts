import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  deleteCampaignChannel,
  parseCampaignChannelFormBody,
  updateCampaignChannel,
} from "@/lib/promotion/campaign-channels-api";
import { requirePromotionCampaignMutationAccess } from "@/lib/promotion/access";

type RouteContext = {
  params: Promise<{ id: string; channelId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, channelId } = await context.params;
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const parsed = parseCampaignChannelFormBody(body);
    if (!parsed) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requirePromotionCampaignMutationAccess(id);
    const result = await updateCampaignChannel(supabase, id, channelId, parsed);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ channel: result.channel });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, channelId } = await context.params;
    const { supabase } = await requirePromotionCampaignMutationAccess(id);
    const result = await deleteCampaignChannel(supabase, id, channelId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
