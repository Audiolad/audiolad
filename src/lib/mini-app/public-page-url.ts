import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

/**
 * Absolute https page on the production origin, with no query, hash, or credentials.
 * Shared by MAX and VK mini-app footers. VK's vkAudioladPageUrl delegates here.
 */
export function miniAppAudioladPageUrl(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(path, `${PRODUCTION_APP_ORIGIN}/`);
  } catch {
    return null;
  }
  if (url.origin !== PRODUCTION_APP_ORIGIN) return null;
  if (url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== path) return null;
  return url.toString();
}
