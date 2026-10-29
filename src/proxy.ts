import { type NextRequest, NextResponse } from "next/server";

import { MAX_SITE_PATH } from "@/lib/max/host";
import { resolveMaxProxyAction } from "@/lib/max/proxy-policy";
import {
  normalizeHostname,
  SCHOOL_SITE_PATH,
} from "@/lib/school/host";
import { resolveSchoolProxyAction } from "@/lib/school/proxy-policy";
import { coffeeHandoffRedirect, migrateCoffeeGuestCookie } from "@/lib/business-app/coffee-host-proxy";
import { COFFEE_HOSTNAME, coffeeHostEnabled } from "@/lib/business-app/host";
import { resolveBusinessProxyAction } from "@/lib/business-app/proxy-policy";
import {
  COURSE_UPGRADE_CHECKOUT_STAGES,
  createCourseUpgradeRequestId,
  courseUpgradeFailureHeaders,
  runCourseUpgradeProtectedUpdateSession,
} from "@/lib/course-content/course-upgrade-stages";
import { updateSession } from "@/lib/supabase/proxy";

type UpdateSessionFn = typeof updateSession;

let updateSessionImpl: UpdateSessionFn = updateSession;

export function setProxyUpdateSessionForTests(fn: UpdateSessionFn | null) {
  updateSessionImpl = fn ?? updateSession;
}

function getRequestHostname(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  return normalizeHostname(forwarded ?? host);
}

/** Same exclusions as the general matcher below (files the proxy normally never sees). */
export const PROXY_STATIC_FILE_PATTERN =
  /^\/(?:_next\/static|_next\/image|favicon\.ico|sw\.js|manifest\.webmanifest)(?:\/|$)|\.(?:svg|png|jpg|jpeg|gif|webp|txt)$/;

export async function proxy(request: NextRequest) {
  const hostname = getRequestHostname(request);
  const { pathname } = request.nextUrl;

  // The coffee-host matcher entry also sends static files here. With the flag OFF the
  // coffee host is 404 on every path; with it ON static files keep the old untouched path.
  if (hostname === COFFEE_HOSTNAME && PROXY_STATIC_FILE_PATTERN.test(pathname)) {
    return coffeeHostEnabled() ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }
  const schoolAction = resolveSchoolProxyAction(hostname, pathname);
  const maxAction = resolveMaxProxyAction(hostname, pathname);
  const businessAction = resolveBusinessProxyAction(hostname, pathname);

  if (
    schoolAction.action === "not_found" ||
    maxAction.action === "not_found" ||
    businessAction.action === "not_found"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  if (schoolAction.action === "rewrite_school_landing") {
    return updateSession(request, { rewritePathname: SCHOOL_SITE_PATH });
  }

  if (maxAction.action === "rewrite_max_landing") {
    return updateSession(request, { rewritePathname: MAX_SITE_PATH });
  }

  if (businessAction.action === "rewrite_business_app") {
    const handoff = coffeeHandoffRedirect(request);
    if (handoff) return handoff;
    return migrateCoffeeGuestCookie(request, await updateSession(request, {
      rewritePathname: businessAction.pathname,
    }));
  }

  return runCourseUpgradeProtectedUpdateSession({
    pathname,
    updateSession: () => updateSessionImpl(request),
    failClosed: () =>
      NextResponse.json(
        { error: "auth_unavailable" },
        {
          status: 503,
          headers: courseUpgradeFailureHeaders(
            "proxy",
            createCourseUpgradeRequestId(),
            COURSE_UPGRADE_CHECKOUT_STAGES.PROXY_AUTH,
          ),
        },
      ),
  });
}

export const config = {
  matcher: [
    // Skip hashed Next assets, images, PWA files, and IndexNow `/{key}.txt`.
    // `/sw.js` and `/manifest.webmanifest` must never hit school-host 404.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt)$).*)",
    // coffee.audiolad.ru only: robots.txt, sw.js, manifest and images too, so the flag-OFF
    // build returns 404 for them (see PROXY_STATIC_FILE_PATTERN). Hashed /_next assets excluded.
    {
      source: "/((?!_next/static|_next/image).*)",
      has: [{ type: "header", key: "host", value: "coffee\\.audiolad\\.ru" }],
    },
  ],
};
