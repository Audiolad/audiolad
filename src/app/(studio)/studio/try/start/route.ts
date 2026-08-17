import { NextResponse } from "next/server";

import { buildPublicRedirectUrl } from "@/lib/seo/app-origin";
import { resolveStudioActor } from "@/lib/studio/guest-access";
import {
  STUDIO_GUEST_TRY_PATH,
  buildStudioGuestCookieOptions,
  decideGuestTryStartFlow,
} from "@/lib/studio/guest-policy";
import { ensureGuestSessionRecord } from "@/lib/studio/server/guest-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await resolveStudioActor();
  const flow = decideGuestTryStartFlow(actor.kind);
  if (flow === "author_studio") {
    return NextResponse.redirect(buildPublicRedirectUrl("/studio/projects", request));
  }

  const { token } = await ensureGuestSessionRecord();
  const next = buildPublicRedirectUrl(STUDIO_GUEST_TRY_PATH, request);
  next.searchParams.set("started", "1");
  const response = NextResponse.redirect(next);
  const options = buildStudioGuestCookieOptions();
  response.cookies.set({
    name: options.name,
    value: token,
    httpOnly: options.httpOnly,
    path: options.path,
    sameSite: options.sameSite,
    secure: options.secure,
    maxAge: options.maxAge,
  });
  return response;
}
