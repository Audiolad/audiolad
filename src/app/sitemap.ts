import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { isMaxHostname } from "@/lib/max/host";
import {
  getHostnameFromHeaders,
  isSchoolHostname,
  SCHOOL_ORIGIN,
} from "@/lib/school/host";
import { buildSitemapEntries } from "@/lib/seo/sitemap-data";

/** Regenerate sitemap hourly so publish/unpublish changes propagate without hammering the DB. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hostname = getHostnameFromHeaders(await headers());

  if (isSchoolHostname(hostname)) {
    return [
      {
        url: `${SCHOOL_ORIGIN}/`,
        changeFrequency: "monthly",
        priority: 0.8,
      },
    ];
  }

  if (isMaxHostname(hostname)) {
    return [];
  }

  const { entries } = await buildSitemapEntries();

  return entries;
}
