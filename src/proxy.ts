import { type NextRequest, NextResponse } from "next/server";

import {
  isMainSiteHostname,
  isSchoolHostname,
  isSchoolSitePath,
  normalizeHostname,
  SCHOOL_SITE_PATH,
} from "@/lib/school/host";
import { updateSession } from "@/lib/supabase/proxy";

function getRequestHostname(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  return normalizeHostname(forwarded ?? host);
}

export async function proxy(request: NextRequest) {
  const hostname = getRequestHostname(request);
  const { pathname } = request.nextUrl;

  // Avoid an indexable duplicate of the school landing on the main site.
  if (isMainSiteHostname(hostname) && isSchoolSitePath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  if (isSchoolHostname(hostname) && pathname === "/") {
    return updateSession(request, { rewritePathname: SCHOOL_SITE_PATH });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and IndexNow ownership `/{key}.txt` (handled by rewrite).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt)$).*)",
  ],
};
