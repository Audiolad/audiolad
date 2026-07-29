import { getAppOrigin } from "@/lib/seo/app-origin";

/**
 * Soft browser CSRF guard for public support form posts.
 * Allows same-origin navigations and same-site fetch; rejects cross-site.
 */
export function isAllowedSupportRequestOrigin(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") {
    return false;
  }
  if (secFetchSite === "same-origin" || secFetchSite === "same-site" || secFetchSite === "none") {
    return true;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    // Non-browser clients without Origin: allow only when Sec-Fetch-Site absent
    // and request looks like same-host Referer.
    const referer = request.headers.get("referer");
    if (!referer) return true;
    try {
      return new URL(referer).origin === getAppOrigin().replace(/\/$/, "") ||
        new URL(referer).origin === new URL(getAppOrigin()).origin;
    } catch {
      return false;
    }
  }

  try {
    const allowed = new URL(getAppOrigin()).origin;
    return new URL(origin).origin === allowed;
  } catch {
    return false;
  }
}

export function getSupportRateLimitKey(request: Request, email: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || "unknown";
  return `help-support:${ip}:${email.toLowerCase()}`;
}
