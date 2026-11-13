import { normalizeHostname } from "@/lib/school/host";
import { hostnameFromHeaders, isLoopbackHostHeader } from "@/lib/supabase/cookie-domain";

export { isLoopbackHostHeader };

import { COFFEE_HOSTNAME } from "./host";

type HeaderReader = { get(name: string): string | null };

/**
 * Hostname the proxy routes by.
 *
 * Coffee admission agrees with checkout/auth: a real public Host beats forwarded input.
 * Exception – a loopback Host. `NextResponse.rewrite()` to `http://localhost:<PORT>/business-app/*`
 * (see `createPassthroughResponse`) is executed by Next.js as a second HTTP request with
 * `Host: localhost:<PORT>` while `X-Forwarded-Host` (set by nginx to `$host`) is kept. Treating
 * that internal request as `localhost` made every rewritten coffee page 404 (incident 02.11.2026).
 * All other hosts keep the established `X-Forwarded-Host ?? Host` routing.
 */
export function resolveProxyRequestHostname(headers: HeaderReader): string {
  const forwarded = headers.get("x-forwarded-host");
  const host = headers.get("host");
  if (isLoopbackHostHeader(host)) {
    return normalizeHostname(forwarded ?? host);
  }
  if (normalizeHostname(host) === COFFEE_HOSTNAME || normalizeHostname(forwarded) === COFFEE_HOSTNAME) {
    return hostnameFromHeaders(headers);
  }
  return normalizeHostname(forwarded ?? host);
}
