/** t1578u: same-origin check for admin evidence POSTs (binary chunks, not JSON). */
export function isSameOriginRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site")?.toLowerCase();
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
