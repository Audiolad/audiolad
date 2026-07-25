import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Keep tracing rooted at this checkout so nested git worktrees are not
  // confused by a parent package-lock.json outside the worktree.
  outputFileTracingRoot: projectRoot,
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
    ];
  },
};

export default nextConfig;
