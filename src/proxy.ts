import { type NextRequest, NextResponse } from "next/server";

import { MAX_SITE_PATH } from "@/lib/max/host";
import { resolveMaxProxyAction } from "@/lib/max/proxy-policy";
import {
  normalizeHostname,
  SCHOOL_SITE_PATH,
} from "@/lib/school/host";
import { resolveSchoolProxyAction } from "@/lib/school/proxy-policy";
import {
  createCourseUpgradeRequestId,
  courseUpgradeObservabilityHeaders,
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

export async function proxy(request: NextRequest) {
  const hostname = getRequestHostname(request);
  const { pathname } = request.nextUrl;
  const schoolAction = resolveSchoolProxyAction(hostname, pathname);
  const maxAction = resolveMaxProxyAction(hostname, pathname);

  if (schoolAction.action === "not_found" || maxAction.action === "not_found") {
    return new NextResponse(null, { status: 404 });
  }

  if (schoolAction.action === "rewrite_school_landing") {
    return updateSession(request, { rewritePathname: SCHOOL_SITE_PATH });
  }

  if (maxAction.action === "rewrite_max_landing") {
    return updateSession(request, { rewritePathname: MAX_SITE_PATH });
  }

  return runCourseUpgradeProtectedUpdateSession({
    pathname,
    updateSession: () => updateSessionImpl(request),
    failClosed: () =>
      NextResponse.json(
        { error: "auth_unavailable" },
        {
          status: 503,
          headers: courseUpgradeObservabilityHeaders(
            "proxy",
            createCourseUpgradeRequestId(),
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
  ],
};
