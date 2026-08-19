import { NextResponse } from "next/server";

import { buildPublicRedirectUrl } from "@/lib/seo/app-origin";
import {
  buildGuestHandoffResultPath,
  buildGuestHandoffSafeReturnPath,
} from "@/lib/studio/guest-handoff";
import { buildStudioGuestCookieOptions } from "@/lib/studio/guest-policy";
import { redeemStudioGuestHandoff } from "@/lib/studio/server/guest-handoff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  const result = await redeemStudioGuestHandoff(token);

  if (!result.ok) {
    return NextResponse.redirect(
      buildPublicRedirectUrl(buildGuestHandoffResultPath(result.error), request),
      303,
    );
  }

  const response = NextResponse.redirect(
    buildPublicRedirectUrl(
      buildGuestHandoffSafeReturnPath(result.projectId),
      request,
    ),
    303,
  );
  const options = buildStudioGuestCookieOptions();
  response.cookies.set({
    name: options.name,
    value: result.token,
    httpOnly: options.httpOnly,
    path: options.path,
    sameSite: options.sameSite,
    secure: options.secure,
    maxAge: options.maxAge,
  });
  return response;
}
