import type { MetadataRoute } from "next";

import { buildSitemapEntries } from "@/lib/seo/sitemap-data";

/** Regenerate sitemap hourly so publish/unpublish changes propagate without hammering the DB. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { entries } = await buildSitemapEntries();

  return entries;
}
