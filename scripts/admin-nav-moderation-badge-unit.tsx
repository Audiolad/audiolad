/**
 * «Модерация продуктов» top-tab badge (owner request 17.10.2026).
 * count 0 → no badge, normal style; count N → orange badge N + orange tab; > 99 → 99+.
 * Works on active and inactive tab. Layout uses the count-only query, gated by author_products.moderate.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminNavTabs, { type AdminNavLink } from "../src/components/admin/AdminNavTabs";
import { formatAdminNavBadgeCount } from "../src/lib/admin/nav-badge";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// formatter
assert.equal(formatAdminNavBadgeCount(0), null);
assert.equal(formatAdminNavBadgeCount(undefined), null);
assert.equal(formatAdminNavBadgeCount(null), null);
assert.equal(formatAdminNavBadgeCount(-3), null);
assert.equal(formatAdminNavBadgeCount(Number.NaN), null);
assert.equal(formatAdminNavBadgeCount(1), "1");
assert.equal(formatAdminNavBadgeCount(2), "2");
assert.equal(formatAdminNavBadgeCount(99), "99");
assert.equal(formatAdminNavBadgeCount(100), "99+");
assert.equal(formatAdminNavBadgeCount(12345), "99+");

function items(count: number): AdminNavLink[] {
  return [
    { href: "/admin", label: "Обзор" },
    {
      href: "/admin/product-moderation",
      label: "Модерация продуктов",
      badgeCount: count,
      badgeTone: "attention",
      badgeLabel: "На модерации",
    },
    { href: "/admin/tracks", label: "Треки" },
  ];
}

function render(count: number, pathname: string): string {
  return renderToStaticMarkup(createElement(AdminNavTabs, { items: items(count), pathname }));
}

function moderationTab(html: string): string {
  const match = html.match(/<a[^>]*data-nav-href="\/admin\/product-moderation"[^>]*>[\s\S]*?<\/a>/);
  assert.ok(match, "moderation tab rendered");
  return match[0];
}

for (const pathname of ["/admin", "/admin/product-moderation", "/admin/product-moderation/abc"]) {
  // count 0 → no badge, normal style
  const zero = moderationTab(render(0, pathname));
  assert.doesNotMatch(zero, /data-nav-badge/, `${pathname}: no badge at 0`);
  assert.doesNotMatch(zero, /data-nav-attention/);
  assert.doesNotMatch(zero, /#f97316|#fff4e6|#f5b56b|#f59e0b/, `${pathname}: no orange at 0`);

  // count N → badge N, orange
  const two = moderationTab(render(2, pathname));
  assert.match(two, /data-nav-attention="true"/);
  assert.match(two, /<span[^>]*data-nav-badge="attention"[^>]*>2<\/span>/, `${pathname}: badge 2`);
  assert.match(two, /bg-\[#f97316\]/, "orange round badge");
  assert.match(two, /rounded-full/);
  assert.match(two, /aria-label="На модерации: 2"/);

  // 99+
  const many = moderationTab(render(150, pathname));
  assert.match(many, /data-nav-badge="attention"[^>]*>99\+<\/span>/);
  assert.match(many, /aria-label="На модерации: 99\+"/);

  const exact = moderationTab(render(99, pathname));
  assert.match(exact, />99<\/span>/);
}

// inactive vs active styling with count > 0
const inactive = moderationTab(render(2, "/admin"));
assert.match(inactive, /border-\[#f5b56b\]/);
assert.match(inactive, /bg-\[#fff4e6\]/);
assert.doesNotMatch(inactive, /aria-current/);
const active = moderationTab(render(2, "/admin/product-moderation"));
assert.match(active, /aria-current="page"/);
assert.match(active, /bg-\[#7042c5\]/);
assert.match(active, /ring-\[#f59e0b\]/);

// other tabs unaffected
const html = render(5, "/admin");
const tracks = html.match(/<a[^>]*data-nav-href="\/admin\/tracks"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
assert.doesNotMatch(tracks, /data-nav-badge|#f97316|#fff4e6/);

// default-tone badges (commercial / author applications) keep purple style
const defaultHtml = renderToStaticMarkup(
  createElement(AdminNavTabs, {
    items: [{ href: "/admin/commercial-applications", label: "Коммерческие заявки", badgeCount: 3 }],
    pathname: "/admin",
  }),
);
assert.match(defaultHtml, /data-nav-badge="default"[^>]*>3<\/span>/);
assert.match(defaultHtml, /aria-label="Новых: 3"/);
assert.doesNotMatch(defaultHtml, /#f97316/);

// mobile: tab bar wraps; label truncates, badge never shrinks
assert.match(html, /<nav class="flex flex-wrap gap-2"/);
assert.match(moderationTab(render(2, "/admin")), /max-w-full/);
assert.match(moderationTab(render(2, "/admin")), /shrink-0/);

// source guards: same source of truth, count only, permission gated
const layout = read("src/app/(platform)/admin/layout.tsx");
assert.match(layout, /snapshotHasPermission\(\s*session\.access,\s*"author_products\.moderate",?\s*\)/);
assert.match(layout, /getCachedAdminProductModerationSubmittedCount/);
assert.match(layout, /canModerateProducts\s*\?/);
assert.match(layout, /badgeTone = "attention"/);

const cacheSrc = read("src/lib/admin/product-moderation-attention-cache.ts");
assert.match(cacheSrc, /countAdminProductModerationSubmitted/);

const queries = read("src/lib/admin/product-moderation-queries.ts");
const countFn = queries.match(/export async function countAdminProductModerationSubmitted[\s\S]*?\n}\n/)?.[0] ?? "";
assert.match(countFn, /count: "exact", head: true/, "count-only head query");
assert.match(countFn, /\.eq\("moderation_status", "submitted"\)/);
assert.match(countFn, /\.is\("deleted_at", null\)/);
// list "submitted" filter uses the same predicate
assert.match(
  queries,
  /case "submitted":\s*query = query\s*\.eq\("moderation_status", "submitted"\)/,
);
assert.match(queries, /listAdminProductModerationQueue[\s\S]*?\.is\("deleted_at", null\)/);

console.log("admin-nav-moderation-badge-unit: ok");
