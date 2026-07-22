import type { MetadataRoute } from "next";

import { buildRobotsRoute } from "@/lib/seo/robots-config";

export default function robots(): MetadataRoute.Robots {
  return buildRobotsRoute();
}
