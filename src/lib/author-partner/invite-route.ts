import { NextResponse } from "next/server";

import { touchPartnerInvite } from "@/lib/author-partner/attribution";
import { buildPublicRedirectUrl } from "@/lib/seo/app-origin";
import { FOR_AUTHORS_PATH } from "@/lib/seo/for-authors";
import {
  applyPartnerAttributionCookie,
  clearPartnerAttributionCookie,
  shouldClearPartnerAttributionCookie,
} from "@/lib/author-partner/cookie";
import { decodeInviteCodeParam } from "@/lib/author-partner/invite-code-param";

export type PartnerInviteLanding = "home" | "for-authors";

type TouchInvite = typeof touchPartnerInvite;

function landingPath(landing: PartnerInviteLanding): string {
  return landing === "home" ? "/" : FOR_AUTHORS_PATH;
}

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(buildPublicRedirectUrl(path, request));
}

function redirectToBecomeAuthor(request: Request): NextResponse {
  return NextResponse.redirect(
    buildPublicRedirectUrl("/become-author", request),
  );
}

function notFoundResponse(): NextResponse {
  return new NextResponse("Приглашение не найдено", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Shared first-touch entry for /r/{code} and /invite/{code}.
 * Both landings call the same touchPartnerInvite; only the success redirect differs.
 */
export async function handlePartnerInviteRequest(input: {
  request: Request;
  rawCode: string;
  landing: PartnerInviteLanding;
  existingToken: string | null | undefined;
  inviteeUserId: string | null;
  touch?: TouchInvite;
}): Promise<NextResponse> {
  const code = decodeInviteCodeParam(input.rawCode);
  if (!code) {
    return notFoundResponse();
  }

  const touch = input.touch ?? touchPartnerInvite;
  const result = await touch({
    code,
    existingToken: input.existingToken,
    inviteeUserId: input.inviteeUserId,
  });

  if (!result.ok) {
    const response = notFoundResponse();
    if (
      input.existingToken &&
      shouldClearPartnerAttributionCookie({ ok: false, error: result.error })
    ) {
      clearPartnerAttributionCookie(response.cookies);
    }
    return response;
  }

  if (result.result === "already_author") {
    const response = redirectToBecomeAuthor(input.request);
    clearPartnerAttributionCookie(response.cookies);
    return response;
  }

  const response = redirectTo(input.request, landingPath(input.landing));

  if (result.setCookie && result.token) {
    applyPartnerAttributionCookie(response.cookies, result.token);
  } else if (
    input.inviteeUserId &&
    shouldClearPartnerAttributionCookie({ ok: true, result: result.result })
  ) {
    clearPartnerAttributionCookie(response.cookies);
  }

  return response;
}
