import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { touchPartnerInvite } from "@/lib/author-partner/attribution";
import { AUTHOR_PARTNER_ATTRIBUTION_COOKIE } from "@/lib/author-partner/constants";
import { applyPartnerAttributionCookie } from "@/lib/author-partner/cookie";
import { decodeInviteCodeParam } from "@/lib/author-partner/invite-code-param";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirectToBecomeAuthor(request: Request, invited: boolean): NextResponse {
  const url = new URL("/become-author", request.url);
  if (invited) {
    url.searchParams.set("invited", "1");
  }
  return NextResponse.redirect(url);
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
    return notFoundResponse();
  }

  if (result.result === "already_author") {
    return redirectToBecomeAuthor(request, false);
  }

  const response = redirectToBecomeAuthor(request, true);

  if (result.setCookie && result.token) {
    applyPartnerAttributionCookie(response.cookies, result.token);
  }

  return response;
}
