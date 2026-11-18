/**
 * t1544u: скрытый правовой раздел /b/legal.
 * - каждая страница noindex/nofollow, X-Robots-Tag в next.config;
 * - нет в sitemap и нет ссылок на /b/legal из остального кода;
 * - только «–», внешних ссылок нет, кроме МАКС-контакта Сергея;
 * - проверка сертификата: образец находится, неизвестный номер – не найден.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  BUSINESS_LEGAL_CONTACT,
  BUSINESS_LEGAL_ROBOTS,
  BUSINESS_LEGAL_SAMPLE_CERTIFICATE,
  findBusinessLegalCertificate,
  normalizeBusinessLegalCertificateNumber,
} from "../src/lib/business/legal/section";

const ROOT = process.cwd();
const SECTION_DIR = join(ROOT, "src/app/(platform)/b/legal");
const COMPONENT_DIR = join(ROOT, "src/components/business/legal");
const OWN_FILES = new Set([
  join(ROOT, "src/lib/business/legal/section.ts"),
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sectionFiles = walk(SECTION_DIR);
const componentFiles = walk(COMPONENT_DIR);
const pages = sectionFiles.filter((f) => f.endsWith("page.tsx"));
assert.equal(pages.length, 5, "5 страниц раздела");
assert.ok(sectionFiles.some((f) => f.endsWith(`${join("legal", "layout.tsx")}`)), "layout раздела");
assert.ok(componentFiles.some((f) => f.endsWith("business-legal.css")), "coffee CSS");
for (const f of [...sectionFiles, ...componentFiles]) OWN_FILES.add(f);

// robots
assert.deepEqual(BUSINESS_LEGAL_ROBOTS && typeof BUSINESS_LEGAL_ROBOTS === "object" && {
  index: (BUSINESS_LEGAL_ROBOTS as { index?: boolean }).index,
  follow: (BUSINESS_LEGAL_ROBOTS as { follow?: boolean }).follow,
}, { index: false, follow: false });
for (const f of pages) {
  assert.match(readFileSync(f, "utf8"), /robots: BUSINESS_LEGAL_ROBOTS/, `${f}: robots noindex`);
}
const nextConfig = readFileSync(join(ROOT, "next.config.ts"), "utf8");
for (const src of ["/b/legal", "/b/legal/:path*", "/b-legal/:path*"]) {
  assert.ok(
    new RegExp(`source: "${src.replace(/[*/]/g, "\\$&")}",\\s*headers: \\[\\{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" \\}\\]`).test(nextConfig),
    `X-Robots-Tag для ${src}`,
  );
}

// sitemap
const sitemapData = readFileSync(join(ROOT, "src/lib/seo/sitemap-data.ts"), "utf8");
assert.doesNotMatch(sitemapData, /\/b\/legal/, "раздела нет в sitemap");

// ссылки на раздел только изнутри раздела
const offenders = walk(join(ROOT, "src"))
  .filter((f) => /\.(tsx?|mts|md|mdx|json)$/.test(f) && !OWN_FILES.has(f))
  .filter((f) => /["'`(]\/b\/legal|audiolad\.ru\/b\/legal|business\/legal\/section|business\/legal\/BusinessLegalShell/.test(readFileSync(f, "utf8")));
assert.deepEqual(offenders, [], "на /b/legal никто не ссылается");

// тексты
for (const f of [...sectionFiles, ...OWN_FILES]) {
  const text = readFileSync(f, "utf8");
  assert.doesNotMatch(text, /—/, `${f}: длинное тире`);
  const external = [...text.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
  assert.deepEqual(external, [], `${f}: внешние ссылки в тексте`);
  assert.doesNotMatch(text, /Suno|уточнить|\[ЮРИСТ|\[СЕРГЕЙ/i, `${f}: черновые пометки`);
}

// стиль кофейни: в разделе не осталось фиолетовой палитры /b/prava
const PURPLE = /#7042c5|#fbf9ff|#f4e9ff|#eadff8|#faf6ff|#eee3f8|#6d5a9e|#4c3d78|#25135c/i;
for (const f of [...sectionFiles, ...componentFiles]) {
  if (f.endsWith(".png") || f.endsWith(".pdf")) continue;
  assert.doesNotMatch(readFileSync(f, "utf8"), PURPLE, `${f}: фиолетовая палитра`);
}
const shell = readFileSync(join(COMPONENT_DIR, "BusinessLegalShell.tsx"), "utf8");
const css = readFileSync(join(COMPONENT_DIR, "business-legal.css"), "utf8");
assert.match(css, /--legal-bg: #f7f1e8/, "кремовый фон кофейни");
assert.match(css, /--legal-accent: #6f4326/, "коричневый акцент кофейни");
assert.match(css, /--legal-text: #2b1d14/, "espresso текст");
assert.doesNotMatch(css, /business-app\/theme\/business-theme\.css/, "тема кабинета не импортируется в CSS раздела");
assert.doesNotMatch(
  readFileSync(join(SECTION_DIR, "layout.tsx"), "utf8"),
  /business-app\/theme\/business-theme\.css/,
  "тема кабинета не импортируется в layout раздела",
);
assert.match(shell, /COFFEE_BRAND_NAME/, "шапка АудиоЛад Кофейня");
assert.doesNotMatch(shell, /data-biz-theme/, "без data-biz-theme на audiolad.ru");
assert.ok(BUSINESS_LEGAL_CONTACT.maxHref.startsWith("https://max.ru/u/"), "МАКС – прямая ссылка Сергея");
assert.equal(BUSINESS_LEGAL_CONTACT.phoneHref, "tel:+79264111381");
assert.equal(BUSINESS_LEGAL_CONTACT.email, "1@audiolad.ru");

// номера сертификатов
assert.equal(normalizeBusinessLegalCertificateNumber("alk-2026-000001"), "ALK-2026-000001");
assert.equal(normalizeBusinessLegalCertificateNumber(encodeURIComponent("АЛК-2026-000001")), "ALK-2026-000001");
assert.equal(normalizeBusinessLegalCertificateNumber("ALK-2026-1"), null);
assert.equal(normalizeBusinessLegalCertificateNumber("%E0%A4%A"), null);
assert.equal(findBusinessLegalCertificate("ALK-2026-000001"), BUSINESS_LEGAL_SAMPLE_CERTIFICATE);
assert.equal(findBusinessLegalCertificate("ALK-2026-000002"), null);
assert.equal(findBusinessLegalCertificate("../../etc"), null);

console.log("business-legal-section-unit: PASS");
