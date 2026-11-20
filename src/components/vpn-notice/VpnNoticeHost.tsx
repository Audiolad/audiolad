import { cookies, headers } from "next/headers";

import { BUSINESS_POINT_COOKIE } from "@/lib/business-app/point-session";
import { getHostnameFromHeaders } from "@/lib/school/host";
import { lookupVpnNoticeCountry } from "@/lib/vpn-notice/country.server";
import { isVpnNoticeHost } from "@/lib/vpn-notice/decision";

import VpnNoticeBanner from "./VpnNoticeBanner";

/** Server wrapper: looks up the country once and skips the client banner for Russia and hall devices. */
export default async function VpnNoticeHost() {
  const headerStore = await headers();
  const hostname = getHostnameFromHeaders(headerStore);
  if (!isVpnNoticeHost(hostname)) return null;
  // al-point is HttpOnly, so the client cannot see it. Any cookie means this is a hall browser.
  const point = (await cookies()).get(BUSINESS_POINT_COOKIE)?.value;
  if (point) return null;
  const country = await lookupVpnNoticeCountry(headerStore);
  if (!country || country === "RU") return null;
  return <VpnNoticeBanner country={country} hostname={hostname} />;
}
