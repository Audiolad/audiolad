import { NextResponse } from "next/server";

import {
  createGuestAudioSignedUrl,
  findGuestMaterialByRawToken,
  isGuestMaterialAvailable,
} from "@/lib/personal-materials/server/delivery";
import {
  guestNotAvailableResponse,
  guestPrivacyHeaders,
  handlePersonalMaterialRouteError,
} from "@/lib/personal-materials/server/errors";
import {
  enforceGuestAudioRateLimit,
  logGuestRouteAccess,
} from "@/lib/personal-materials/server/rate-limit";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    logGuestRouteAccess(request);

    const rateLimited = enforceGuestAudioRateLimit(request);

    if (rateLimited) {
      return rateLimited;
    }

    const { token } = await context.params;
    const material = await findGuestMaterialByRawToken(token);

    if (!material || !isGuestMaterialAvailable(material)) {
      return guestNotAvailableResponse();
    }

    const signed = await createGuestAudioSignedUrl(material);

    return NextResponse.json(signed, { headers: guestPrivacyHeaders() });
  } catch (error) {
    return handlePersonalMaterialRouteError(error);
  }
}
