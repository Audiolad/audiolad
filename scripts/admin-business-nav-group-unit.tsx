/**
 * Admin menu: one «АудиоЛад Бизнес» pill, submenu keeps the real section URLs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminNavTabs, { type AdminNavLink } from "../src/components/admin/AdminNavTabs";
import { ADMIN_NAV_ITEMS } from "../src/lib/admin/nav";
import { AUDIOLAD_BUSINESS_NAV_LABEL, groupAudioladBusinessNav } from "../src/lib/admin/nav-group";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const sections = [
  { href: "/admin/business-admissions", label: "Допуски музыки" },
  { href: "/admin/business-verification", label: "Проверка правообладателей" },
  { href: "/admin/business-track-review", label: "Прослушивание треков" },
] as const;

for (const section of sections) {
  const item = ADMIN_NAV_ITEMS.find((entry) => entry.href === section.href);
  assert.ok(item, section.href);
  assert.equal(item.label, section.label);
  assert.equal(item.requiredPermission, "author_products.moderate");
}

const items = (verificationCount: number, extra = 0): AdminNavLink[] => [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/product-moderation", label: "Модерация продуктов", badgeCount: 4, badgeTone: "attention", badgeLabel: "На модерации" },
  { href: "/admin/business-admissions", label: "Бизнес: допуски музыки" },
  { href: "/admin/business-verification", label: "Бизнес: проверка правообладателей", badgeCount: verificationCount, badgeTone: "attention", badgeLabel: "Ждут решения" },
  { href: "/admin/business-track-review", label: "Бизнес: прослушивание треков", badgeCount: extra, badgeTone: "attention", badgeLabel: "Ждут решения" },
  { href: "/admin/school-graduates", label: "Выпускники Школы аудиопрактик" },
];

function render(pathname: string, verificationCount = 3, extra = 0) {
  return renderToStaticMarkup(createElement(AdminNavTabs, { items: items(verificationCount, extra), pathname }));
}

const onReview = render("/admin/business-track-review");
assert.equal(onReview.match(/АудиоЛад Бизнес/g)?.length, 2, "button label and submenu name");
assert.doesNotMatch(onReview, /Бизнес:/);
assert.doesNotMatch(onReview, /—/);
for (const section of sections) {
  assert.match(onReview, new RegExp(`href="${section.href}"`));
  assert.match(onReview, new RegExp(`>${section.label}<`));
}
const parent = onReview.match(/<a[^>]*data-nav-href="audiolad-business"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
assert.match(parent, /АудиоЛад Бизнес/);
assert.match(parent, /href="\/admin\/business-admissions"/);
assert.match(parent, /aria-current="true"/);
assert.match(parent, /data-nav-badge="attention"[^>]*>3<\/span>/);
assert.match(parent, /bg-\[#7042c5\]/);
const review = onReview.match(/<a[^>]*data-nav-href="\/admin\/business-track-review"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
assert.match(review, /aria-current="page"/);
assert.match(review, /Прослушивание треков/);
const admissions = onReview.match(/<a[^>]*data-nav-href="\/admin\/business-admissions"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
assert.doesNotMatch(admissions, /aria-current="page"/);
assert.match(onReview, /aria-label="АудиоЛад Бизнес"/);
const nested = render("/admin/business-verification/case-1");
assert.match(nested, /aria-label="АудиоЛад Бизнес"/);
assert.match(nested, /data-nav-href="audiolad-business"[^>]*aria-current="true"/);
assert.match(nested, /aria-current="page"/);
assert.match(onReview, /<nav class="flex flex-wrap gap-2" aria-label="Панель управления"/);

const elsewhere = render("/admin/product-moderation");
const idleParent = elsewhere.match(/<a[^>]*data-nav-href="audiolad-business"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
assert.doesNotMatch(idleParent, /aria-current/);
assert.match(idleParent, /data-nav-badge="attention"[^>]*>3<\/span>/);
assert.doesNotMatch(elsewhere, /Проверка правообладателей/);
assert.doesNotMatch(elsewhere, /Прослушивание треков/);
assert.doesNotMatch(elsewhere, /Допуски музыки/);
assert.doesNotMatch(elsewhere, /aria-label="АудиоЛад Бизнес"/);
assert.equal(elsewhere.match(/<nav /g)?.length, 1);

const summed = render("/admin/business-admissions", 60, 50);
const summedParent = summed.match(/<a[^>]*data-nav-href="audiolad-business"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
assert.match(summedParent, /aria-current="true"/);
assert.match(summedParent, />99\+<\/span>/);
assert.match(summed, /data-nav-href="\/admin\/business-verification"[\s\S]*?>60<\/span>/);
assert.match(summed, /data-nav-href="\/admin\/business-track-review"[\s\S]*?>50<\/span>/);
const overview = render("/admin", 60, 50);
assert.match(overview.match(/<a[^>]*data-nav-href="audiolad-business"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "", />99\+<\/span>/);
assert.doesNotMatch(overview, /data-nav-href="\/admin\/business-verification"/);
assert.doesNotMatch(overview, /data-nav-href="\/admin\/business-track-review"/);

const plain = renderToStaticMarkup(createElement(AdminNavTabs, {
  items: [{ href: "/admin", label: "Обзор" }, { href: "/admin/tracks", label: "Треки" }],
  pathname: "/admin",
}));
assert.doesNotMatch(plain, /АудиоЛад Бизнес/);
assert.equal(plain.match(/<nav /g)?.length, 1);

const grouped = groupAudioladBusinessNav(items(0));
assert.equal(grouped.business?.map((item) => item.href).join(","), sections.map((section) => section.href).join(","));
assert.equal(grouped.primary.find((item) => item.navId === "audiolad-business")?.label, AUDIOLAD_BUSINESS_NAV_LABEL);
assert.equal(grouped.primary.filter((item) => item.href.startsWith("/admin/business-")).length, 1);

const tabs = read("src/components/admin/AdminNavTabs.tsx");
const group = read("src/lib/admin/nav-group.ts");
assert.match(tabs, /groupAudioladBusinessNav/);
assert.match(group, /АудиоЛад Бизнес/);
assert.doesNotMatch(group, /—/);
assert.doesNotMatch(read("src/app/(platform)/admin/layout.tsx"), /href:\s*"\/admin\/business"/);

console.log("admin-business-nav-group-unit: ok");
