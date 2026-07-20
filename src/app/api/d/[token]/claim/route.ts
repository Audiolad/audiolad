import { NextResponse } from "next/server";

import { claimPersonalMaterialByRawToken } from "@/lib/personal-materials/server/claim";
import {
  findGuestMaterialByRawToken,
  isGuestMaterialAvailable,
} from "@/lib/personal-materials/server/delivery";
import {
  guestNotAvailableResponse,
  guestPrivacyHeaders,
  handlePersonalMaterialRouteError,
} from "@/lib/personal-materials/server/errors";
import {
  enforceGuestMetadataRateLimit,
  logGuestRouteAccess,
} from "@/lib/personal-materials/server/rate-limit";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    logGuestRouteAccess(request);

    const rateLimited = enforceGuestMetadataRateLimit(request);

    if (rateLimited) {
      return rateLimited;
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: guestPrivacyHeaders() },
      );
    }

    const { token } = await context.params;
    const material = await findGuestMaterialByRawToken(token);

    if (!material || !isGuestMaterialAvailable(material)) {
      return guestNotAvailableResponse();
    }

    const result = await claimPersonalMaterialByRawToken(supabase, token);

    return NextResponse.json(
      {
        materialId: result.materialId,
        claimed: result.claimed,
      },
      { headers: guestPrivacyHeaders() },
    );
  } catch (error) {
    return handlePersonalMaterialRouteError(error);
  }
}
