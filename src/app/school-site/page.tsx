import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import SchoolFirstScreen from "@/components/school/SchoolFirstScreen";
import SchoolSiteHeader from "@/components/school/SchoolSiteHeader";
import {
  getHostnameFromHeaders,
  isMainSiteHostname,
} from "@/lib/school/host";
import { buildSchoolLandingMetadata } from "@/lib/school/seo";
import { getListenerShellData } from "@/lib/listener/shell-data";

export const metadata: Metadata = buildSchoolLandingMetadata();

export default async function SchoolSitePage() {
  const hostname = getHostnameFromHeaders(await headers());

  // Defense in depth: proxy already 404s on apex; keep page-level guard too.
  if (isMainSiteHostname(hostname)) {
    notFound();
  }

  const shellData = await getListenerShellData();

  return (
    <main>
      <SchoolSiteHeader shellData={shellData} />
      <SchoolFirstScreen />
      <div id="tariffs" className="school-site-tariffs-anchor" />
    </main>
  );
}
