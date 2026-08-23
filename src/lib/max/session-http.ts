import { MAX_HOSTNAME } from "@/lib/max/host";

export const MAX_SESSION_BODY_MAX_BYTES = 16_384;

export function isAllowedMaxSessionOrigin(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).hostname === MAX_HOSTNAME;
    } catch {
      return false;
    }
  }

  if (secFetchSite === "same-origin" || secFetchSite === "none") {
    return true;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).hostname === MAX_HOSTNAME;
  } catch {
    return false;
  }
}
