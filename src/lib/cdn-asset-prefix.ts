/** Next.js assetPrefix for /_next/static (JS/CSS/hashed media/fonts). */
export function resolveCdnAssetPrefix(
  raw: string | undefined | null,
): string | undefined {
  if (raw == null) return undefined;
  const prefix = raw.trim().replace(/\/+$/, "");
  return prefix === "" ? undefined : prefix;
}
