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

/**
 * School host routing policy (pure, unit-tested).
 *
 * - Main site `/school-site` → 404 (no indexable duplicate).
 * - School host `/` → internal rewrite to `/school-site` (public URL stays `/`).
 * - School host `/school-site` must NOT 308→`/`: Next re-enters proxy after rewrite
 *   and that redirect creates an infinite loop.
 * - School host exposes no platform application routes.
 */
export type SchoolProxyAction =
  | { action: "not_found" }
  | { action: "rewrite_school_landing" }
  | { action: "pass_through" };

export function resolveSchoolProxyAction(
  hostname: string,
  pathname: string,
): SchoolProxyAction {
  if (isMainSiteHostname(hostname) && isSchoolSitePath(pathname)) {
    return { action: "not_found" };
  }

  if (isSchoolHostname(hostname) && pathname === "/") {
    return { action: "rewrite_school_landing" };
  }

  if (
    isSchoolHostname(hostname) &&
    ![
      SCHOOL_SITE_PATH,
      "/robots.txt",
      "/sitemap.xml",
    ].includes(pathname)
  ) {
    return { action: "not_found" };
  }

  return { action: "pass_through" };
}

export async function proxy(request: NextRequest) {
  const hostname = getRequestHostname(request);
  const { pathname } = request.nextUrl;
  const schoolAction = resolveSchoolProxyAction(hostname, pathname);

  if (schoolAction.action === "not_found") {
    return new NextResponse(null, { status: 404 });
  }

  if (schoolAction.action === "rewrite_school_landing") {
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
