import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  AccessLinkError,
  requirePlatformAdminAccessLinkActor,
  revokePracticeAccessLink,
} from "@/lib/products/access-links-server";

type RouteContext = {
  params: Promise<{ id: string; linkId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id, linkId } = await context.params;
    const { user } = await requirePlatformAdminAccessLinkActor();
    const link = await revokePracticeAccessLink({
      practiceId: id,
      linkId,
      revokedByUserId: user.id,
    });

    return NextResponse.json({ link });
  } catch (error) {
    if (error instanceof AccessLinkError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    return handleAuthorRouteError(error);
  }
}
