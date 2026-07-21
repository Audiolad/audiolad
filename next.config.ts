import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
