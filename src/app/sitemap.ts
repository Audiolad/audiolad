import type { MetadataRoute } from "next";

import { buildSitemapEntries } from "@/lib/seo/sitemap-data";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { entries } = await buildSitemapEntries();

  return entries;
}
