import { NextResponse } from "next/server";

import {
  findGuestMaterialByRawToken,
  isGuestMaterialAvailable,
  loadGuestAuthor,
} from "@/lib/personal-materials/server/delivery";
import { toSafeGuestPersonalMaterialDto } from "@/lib/personal-materials/server/dto";
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

export async function GET(request: Request, context: RouteContext) {
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

    const author = await loadGuestAuthor(material.author_id);

    if (!author?.id || !author.name || !author.slug) {
      return guestNotAvailableResponse();
    }

    return NextResponse.json(
      {
        material: toSafeGuestPersonalMaterialDto({ material, author }),
      },
      { headers: guestPrivacyHeaders() },
    );
  } catch (error) {
    return handlePersonalMaterialRouteError(error);
  }
}
