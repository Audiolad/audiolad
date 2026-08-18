#!/usr/bin/env node
/**
 * PR2 sidebar WebP + public cache headers + overlay gzip_static.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const sidebar = read("src/components/listener/DesktopSidebar.tsx");
const nextConfig = read("next.config.ts");
const overlay = read("deploy/nginx/next-static-overlay.location.conf");
const common = read("deploy/scripts/lib/common.sh");

const banner = join(root, "public/images/sidebar/become-author-banner-v2.webp");
const logo = join(root, "public/brand/audiolad-logo-sidebar-v2.webp");
assert(existsSync(banner), "sidebar banner webp exists");
assert(existsSync(logo), "sidebar logo webp exists");
assert(statSync(banner).size < 80_000, "banner webp stays small");
assert(statSync(logo).size < 40_000, "logo webp stays small");

assert(
  sidebar.includes("become-author-banner-v2.webp"),
  "sidebar static-imports banner webp",
);
assert(
  sidebar.includes("audiolad-logo-sidebar-v2.webp"),
  "sidebar static-imports logo webp",
);
assert(sidebar.includes('sizes="216px"'), "banner has 216px sizes");
assert(sidebar.includes('sizes="280px"'), "logo keeps 280px sizes");
assert(!sidebar.includes("priority"), "sidebar images are not priority");
assert(
  !sidebar.includes("/images/sidebar/become-author-banner.png"),
  "sidebar no longer points at raw banner png",
);
assert(
  !sidebar.includes("/brand/audiolad-logo-sidebar.png"),
  "sidebar no longer points at raw logo png",
);

assert(
  nextConfig.includes('source: "/images/:path*"'),
  "next.config caches /images",
);
assert(
  nextConfig.includes('source: "/brand/:path*"'),
  "next.config caches /brand",
);
assert(
  nextConfig.includes("max-age=604800"),
  "public image cache is 7 days, not immutable",
);
assert(
  !/source:\s*"\/sw\.js"/.test(nextConfig),
  "sw.js is not given a long cache",
);

assert(overlay.includes("gzip off;"), "overlay disables dynamic gzip");
assert(overlay.includes("gzip_static on;"), "overlay enables gzip_static");
assert(overlay.includes("gzip_vary on;"), "overlay sets Vary Accept-Encoding");
assert(
  common.includes("precompress_next_static_overlay"),
  "deploy hook precompresses overlay siblings",
);
assert(
  common.includes("prune_orphan_gzip_siblings"),
  "deploy hook drops orphan .gz",
);
assert(
  !common.includes("$release_dir/.next/static") ||
    common.includes("Never write .gz into the release tree"),
  "precompress comment keeps release tree clean",
);

console.log("sidebar-static-assets-unit: ok");
