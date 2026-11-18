import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

import { buildVerticalGuideRedirects } from "./src/lib/business/vertical-guides/legacy-redirects";
import { resolveCdnAssetPrefix } from "./src/lib/cdn-asset-prefix";
import { buildEmbedFrameAncestorsPolicy } from "./src/lib/embed/frame-policy";
import { buildVkFrameAncestorsPolicy } from "./src/lib/vk/frame-policy";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Keep tracing rooted at this checkout so nested git worktrees are not
  // confused by a parent package-lock.json outside the worktree.
  outputFileTracingRoot: projectRoot,
  assetPrefix: resolveCdnAssetPrefix(process.env.NEXT_PUBLIC_CDN_ASSET_PREFIX),
  turbopack: {
    root: projectRoot,
  },
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    // App audio limit 50 MB; multipart overhead needs headroom (matches nginx 55m).
    proxyClientMaxBodySize: "55mb",
  },
  async headers() {
    return [
      ...["/practice/:path*", "/listen/:path*", "/api/:path*", "/author-dashboard/:path*", "/admin/:path*", "/studio/:path*"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      })),
      // t1544u / t1567u: правовой раздел скрыт. Живой путь – /b/coffee/legal;
      // старый /b/legal остаётся с тем же заголовком и уходит 301.
      {
        source: "/b/legal",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/b/legal/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/b/coffee/legal",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/b/coffee/legal/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/b-legal/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/classica/production",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/classica/production/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/music-analyzer",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/music-analyzer/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/d/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/embed/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          {
            key: "Content-Security-Policy",
            value: buildEmbedFrameAncestorsPolicy(),
          },
        ],
      },
      {
        source: "/vk",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          {
            key: "Content-Security-Policy",
            value: buildVkFrameAncestorsPolicy(),
          },
        ],
      },
      {
        source: "/products/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/brand/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  async redirects() {
    // Retired vertical guide URLs and the moved legal section (301).
    return [
      { source: "/b/legal", destination: "/b/coffee/legal", statusCode: 301 as const },
      { source: "/b/legal/:path*", destination: "/b/coffee/legal/:path*", statusCode: 301 as const },
      ...buildVerticalGuideRedirects(),
    ];
  },
  async rewrites() {
    // beforeFiles: afterFiles rewrite to ?key=:key did not apply for /{key}.txt
    // on Next 16 production (API query worked; public ownership URL 404'd).
    return {
      beforeFiles: [
        {
          // IndexNow ownership file at site root: /{KEY}.txt → API (key never in git/public/).
          source: "/:key([A-Za-z0-9-]{8,128}).txt",
          destination: "/api/seo/indexnow-key/:key",
        },
      ],
    };
  },
};

export default nextConfig;
