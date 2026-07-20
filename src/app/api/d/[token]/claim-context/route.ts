import { NextResponse } from "next/server";

import {
  buildClaimContextCookieHeader,
  createSignedClaimContext,
} from "@/lib/personal-materials/claim-context";
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

    const { token } = await context.params;
    const material = await findGuestMaterialByRawToken(token);

    if (!material || !isGuestMaterialAvailable(material)) {
      return guestNotAvailableResponse();
    }

    const signedContext = createSignedClaimContext(material.id);

    return NextResponse.json(
      { ok: true, redirectPath: "/personal-materials/claim" },
      {
        headers: {
          ...guestPrivacyHeaders(),
          "Set-Cookie": buildClaimContextCookieHeader(signedContext),
        },
      },
    );
  } catch (error) {
    return handlePersonalMaterialRouteError(error);
  }
}
