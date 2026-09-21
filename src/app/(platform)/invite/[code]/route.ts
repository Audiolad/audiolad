import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { touchPartnerInvite } from "@/lib/author-partner/attribution";
import { buildPublicRedirectUrl } from "@/lib/seo/app-origin";
import { FOR_AUTHORS_PATH } from "@/lib/seo/for-authors";
import { AUTHOR_PARTNER_ATTRIBUTION_COOKIE } from "@/lib/author-partner/constants";
import {
  applyPartnerAttributionCookie,
  clearPartnerAttributionCookie,
  shouldClearPartnerAttributionCookie,
} from "@/lib/author-partner/cookie";
import { decodeInviteCodeParam } from "@/lib/author-partner/invite-code-param";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirectToBecomeAuthor(request: Request): NextResponse {
  return NextResponse.redirect(
    buildPublicRedirectUrl("/become-author", request),
  );
}

function redirectToForAuthors(request: Request): NextResponse {
  return NextResponse.redirect(
    buildPublicRedirectUrl(FOR_AUTHORS_PATH, request),
  );
}

function notFoundResponse(): NextResponse {
  return new NextResponse("Приглашение не найдено", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  // Params are usually already decoded by Next; safeDecode never throws URIError.
  const code = decodeInviteCodeParam(rawCode);

  if (!code) {
    return notFoundResponse();
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(AUTHOR_PARTNER_ATTRIBUTION_COOKIE)?.value;

  let inviteeUserId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    inviteeUserId = user?.id ?? null;
  } catch {
    inviteeUserId = null;
  }

  const result = await touchPartnerInvite({
    code,
    existingToken,
    inviteeUserId,
  });

  if (!result.ok) {
    // Stale/unusable cookie on this token — clear so the next visitor is clean.
    // Do not clear on generic not_found for anonymous mistyped codes without a cookie.
    const response = notFoundResponse();
    if (
      existingToken &&
      shouldClearPartnerAttributionCookie({ ok: false, error: result.error })
    ) {
      clearPartnerAttributionCookie(response.cookies);
    }
    return response;
  }

  if (result.result === "already_author") {
    const response = redirectToBecomeAuthor(request);
    clearPartnerAttributionCookie(response.cookies);
    return response;
  }

  const response = redirectToForAuthors(request);

  if (result.setCookie && result.token) {
    applyPartnerAttributionCookie(response.cookies, result.token);
  } else if (
    inviteeUserId &&
    shouldClearPartnerAttributionCookie({ ok: true, result: result.result })
  ) {
    // Authenticated bind / preserve: author_referrals is SoT — drop browser cookie.
    clearPartnerAttributionCookie(response.cookies);
  }

  return response;
}
