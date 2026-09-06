import { NextResponse } from "next/server";

import {
  AccessLinkError,
  redeemPracticeAccessLink,
} from "@/lib/products/access-links-server";
import { accessLinkPublicErrorMessage } from "@/lib/products/access-links";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "unauthorized",
          message: accessLinkPublicErrorMessage("unauthorized"),
        },
        { status: 401 },
      );
    }

    const result = await redeemPracticeAccessLink({
      rawToken: token,
      userId: user.id,
    });

    return NextResponse.json({
      code: result.code,
      message: accessLinkPublicErrorMessage(result.code),
      productHref: result.productHref,
      accessLevel: result.accessLevel,
      raised: result.raised,
    });
  } catch (error) {
    if (error instanceof AccessLinkError) {
      return NextResponse.json(
        {
          error: error.code,
          message: accessLinkPublicErrorMessage(error.code),
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "internal_error", message: accessLinkPublicErrorMessage("internal_error") },
      { status: 500 },
    );
  }
}
