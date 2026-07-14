import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // App audio limit 50 MB; multipart overhead needs headroom (matches nginx 55m).
    proxyClientMaxBodySize: "55mb",
  },
};

export default nextConfig;
