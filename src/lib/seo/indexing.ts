import { getAppOrigin, PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

/**
 * Whether public search engines should be allowed to index this deployment.
 * Staging, local dev, and non-canonical hosts stay closed unless explicitly overridden.
 */
export function isPublicSeoIndexingEnabled(): boolean {
  if (process.env.SEO_INDEXING === "false") {
    return false;
  }

  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  return getAppOrigin() === PRODUCTION_APP_ORIGIN;
}
