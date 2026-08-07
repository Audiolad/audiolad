import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { getHostnameFromHeaders, isSchoolHostname } from "@/lib/school/host";
import { buildSchoolRobotsRoute } from "@/lib/school/seo";
import { buildRobotsRoute } from "@/lib/seo/robots-config";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostname = getHostnameFromHeaders(await headers());

  if (isSchoolHostname(hostname)) {
    return buildSchoolRobotsRoute();
  }

  return buildRobotsRoute();
}
