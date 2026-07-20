import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  createCampaignChannel,
  listCampaignChannels,
  parseCampaignChannelFormBody,
} from "@/lib/promotion/campaign-channels-api";
import { requirePromotionCampaignAccess } from "@/lib/promotion/access";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePromotionCampaignAccess(id);
    const channels = await listCampaignChannels(supabase, id);

    return NextResponse.json({ channels });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
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

    const { supabase } = await requirePromotionCampaignAccess(id);
    const result = await createCampaignChannel(supabase, id, parsed);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ channel: result.channel }, { status: 201 });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
