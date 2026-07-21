import { NextResponse } from "next/server";

import {
  createGuestPdfSignedUrl,
  findGuestMaterialByRawToken,
  isGuestMaterialAvailable,
} from "@/lib/personal-materials/server/delivery";
import {
  guestNotAvailableResponse,
  guestPrivacyHeaders,
  handlePersonalMaterialRouteError,
} from "@/lib/personal-materials/server/errors";
import {
  enforceGuestPdfRateLimit,
  logGuestRouteAccess,
} from "@/lib/personal-materials/server/rate-limit";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    logGuestRouteAccess(request);

    const rateLimited = enforceGuestPdfRateLimit(request);

    if (rateLimited) {
      return rateLimited;
    }

    const { token } = await context.params;
    const material = await findGuestMaterialByRawToken(token);

    if (!material || !isGuestMaterialAvailable(material)) {
      return guestNotAvailableResponse();
    }

    const signed = await createGuestPdfSignedUrl(material);

    return NextResponse.json(signed, { headers: guestPrivacyHeaders() });
  } catch (error) {
    return handlePersonalMaterialRouteError(error);
  }
}
