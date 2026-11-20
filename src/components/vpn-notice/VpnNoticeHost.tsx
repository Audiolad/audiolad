import { headers } from "next/headers";

import { getHostnameFromHeaders } from "@/lib/school/host";
import { lookupVpnNoticeCountry } from "@/lib/vpn-notice/country.server";
import { isVpnNoticeHost } from "@/lib/vpn-notice/decision";

import VpnNoticeBanner from "./VpnNoticeBanner";

/** Server wrapper: looks up the country once and skips the client banner for Russia. */
export default async function VpnNoticeHost() {
  const headerStore = await headers();
  const hostname = getHostnameFromHeaders(headerStore);
  if (!isVpnNoticeHost(hostname)) return null;
  const country = await lookupVpnNoticeCountry(headerStore);
  if (!country || country === "RU") return null;
  return <VpnNoticeBanner country={country} hostname={hostname} />;
}
