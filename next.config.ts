import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

import { resolveCdnAssetPrefix } from "./src/lib/cdn-asset-prefix";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Keep tracing rooted at this checkout so nested git worktrees are not
  // confused by a parent package-lock.json outside the worktree.
  outputFileTracingRoot: projectRoot,
  assetPrefix: resolveCdnAssetPrefix(process.env.NEXT_PUBLIC_CDN_ASSET_PREFIX),
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    // App audio limit 50 MB; multipart overhead needs headroom (matches nginx 55m).
    proxyClientMaxBodySize: "55mb",
  },
  async headers() {
    return [
      {
        source: "/d/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
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
