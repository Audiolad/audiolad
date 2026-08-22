import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import MaxMiniAppScreen from "@/components/max/MaxMiniAppScreen";
import { isMaxHostname } from "@/lib/max/host";
import { buildMaxLandingMetadata } from "@/lib/max/seo";
import { getHostnameFromHeaders } from "@/lib/school/host";

export const metadata: Metadata = buildMaxLandingMetadata();

export default async function MaxSitePage() {
  const hostname = getHostnameFromHeaders(await headers());

  // Defense in depth: proxy already 404s /max-site on non-MAX hosts.
  if (!isMaxHostname(hostname)) {
    notFound();
  }

  return <MaxMiniAppScreen />;
}
