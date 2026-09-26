import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isPrivateRoute } from "../src/lib/auth/routes";
import {
  BUSINESS_ASSET_FILES,
  BUSINESS_FAQ,
  BUSINESS_INQUIRY_EMAIL,
  BUSINESS_LANDING_CANONICAL,
  BUSINESS_LANDING_DESCRIPTION,
  BUSINESS_LANDING_H1,
  BUSINESS_LANDING_TITLE,
  BUSINESS_LEGAL_QUOTE_CARDS_ENABLED,
  BUSINESS_SEO_ARTICLES,
  BUSINESS_SOURCES,
  BUSINESS_VENUES,
  buildBusinessInquiryMailto,
  buildBusinessSeoArticlePath,
  hasBusinessInquiryErrors,
  listBusinessLandingCopy,
  validateBusinessInquiry,
} from "../src/lib/business/landing";
import { selectBusinessListenCandidates } from "../src/lib/business/listen-selection";
import { buildBusinessLandingMetadata } from "../src/lib/business/metadata";
import { PRODUCTION_APP_ORIGIN } from "../src/lib/seo/app-origin";
import {
  SEO_ROBOTS_DISALLOWED_PATHS,
  buildRobotsRoute,
} from "../src/lib/seo/robots-config";
import {
  STATIC_SITEMAP_PAGES,
  toAbsoluteSitemapUrl,
} from "../src/lib/seo/sitemap-data";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const page = read("src/app/(platform)/b/page.tsx");
const view = read("src/components/business/BusinessLandingView.tsx");
const assetsDir = join(root, "public/business");
const assetFiles = readdirSync(assetsDir).filter((name) => name.endsWith(".webp")).sort();

assert.deepEqual(assetFiles, [...BUSINESS_ASSET_FILES].sort());
assert.equal(existsSync(join(root, "src/app/(platform)/b/[slug]/page.tsx")), false);

assert.equal(
  BUSINESS_LANDING_H1,
  "Музыка для вашего бизнеса – быстро, просто, легально",
);
assert.equal(BUSINESS_LANDING_TITLE, "Музыка для бизнеса – Аудиолад Бизнес");
assert.equal(BUSINESS_LANDING_CANONICAL, "https://audiolad.ru/b");
assert.match(view, /<h1[\s>]/);
assert.equal((view.match(/<h1[\s>]/g) ?? []).length, 1);
assert.doesNotMatch(view, /<h1[^>]*>\s*<Image/);

const metadata = buildBusinessLandingMetadata();
assert.equal(metadata.title, BUSINESS_LANDING_TITLE);
assert.equal(metadata.description, BUSINESS_LANDING_DESCRIPTION);
assert.equal(metadata.alternates && "canonical" in metadata.alternates
  ? metadata.alternates.canonical
  : null, "https://audiolad.ru/b");
assert.deepEqual(metadata.robots, { index: true, follow: true });
assert.doesNotMatch(page, /noindex|nofollow/);
assert.doesNotMatch(view, /noindex|nofollow/);
assert.doesNotMatch(page, /"use client"|redirect\(/);
assert.equal(isPrivateRoute("/b"), false);
assert.equal(isPrivateRoute("/b/"), false);

function robotsRuleBlocksPath(rule: string, pathname: string): boolean {
  if (rule === "/") {
    return true;
  }

  const exact = rule.endsWith("/") ? rule.slice(0, -1) : rule;
  const prefix = rule.endsWith("/") ? rule : `${rule}/`;
  return pathname === exact || pathname.startsWith(prefix);
}

assert.equal(
  SEO_ROBOTS_DISALLOWED_PATHS.some((rule) => robotsRuleBlocksPath(rule, "/b")),
  false,
);

const runtimeEnv = process.env as Record<string, string | undefined>;
const previousNodeEnv = runtimeEnv.NODE_ENV;
const previousSeo = runtimeEnv.SEO_INDEXING;
const previousAppUrl = runtimeEnv.NEXT_PUBLIC_APP_URL;
runtimeEnv.NODE_ENV = "production";
runtimeEnv.SEO_INDEXING = "true";
runtimeEnv.NEXT_PUBLIC_APP_URL = PRODUCTION_APP_ORIGIN;

try {
  const robots = buildRobotsRoute();
  const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
  const disallow = rule && "disallow" in rule ? rule.disallow : [];
  const disallowList = Array.isArray(disallow) ? disallow : disallow ? [disallow] : [];
  assert.equal(disallowList.includes("/"), false);
  assert.equal(
    disallowList.some((entry) => robotsRuleBlocksPath(entry, "/b")),
    false,
  );
  assert.equal(robots.sitemap, "https://audiolad.ru/sitemap.xml");
} finally {
  function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) {
      delete runtimeEnv[name];
    } else {
      runtimeEnv[name] = value;
    }
  }

  restoreEnv("NODE_ENV", previousNodeEnv);
  restoreEnv("SEO_INDEXING", previousSeo);
  restoreEnv("NEXT_PUBLIC_APP_URL", previousAppUrl);
}

assert.equal(
  STATIC_SITEMAP_PAGES.filter((entry) => entry.path === "/b").length,
  1,
);
assert.equal(toAbsoluteSitemapUrl("/b", PRODUCTION_APP_ORIGIN), "https://audiolad.ru/b");

const nextConfig = read("next.config.ts");
assert.doesNotMatch(nextConfig, /source:\s*["']\/b(?:\/|["'])/);
assert.equal((nextConfig.match(/X-Robots-Tag/g) ?? []).length, 2);
assert.match(nextConfig, /source:\s*"\/auth\/:path\*"[\s\S]*X-Robots-Tag/);
assert.match(nextConfig, /source:\s*"\/d\/:path\*"[\s\S]*X-Robots-Tag/);
assert.match(view, /alt=\{venue\.imageAlt\}/);
assert.match(view, /alt="Женщина с ноутбуком в светлом зале с растениями\."/);
assert.match(view, /alt="Иллюстрация: легальная музыка/);
assert.match(view, /alt=\{source\.name\}/);
assert.doesNotMatch(view, /alt=""/);
for (const venue of BUSINESS_VENUES) {
  assert.ok(venue.imageAlt.trim().length > 8, venue.id);
  assert.doesNotMatch(venue.imageAlt, /\u2014|штраф|без РАО|без ВОИС/i);
}

assert.deepEqual(
  BUSINESS_VENUES.map((venue) => [venue.id, venue.futurePath]),
  [
    ["spa", "/b/spa"],
    ["beauty", "/b/beauty"],
    ["cafe", "/b/cafe"],
    ["retail", "/b/retail"],
    ["dentistry", "/b/dentistry"],
    ["restaurants", "/b/restaurants"],
    ["offices", "/b/offices"],
    ["hotels", "/b/hotels"],
  ],
);
assert.doesNotMatch(view, /href="\/b\/(spa|beauty|cafe|retail|dentistry|restaurants|offices|hotels)"/);
assert.match(view, /data-business-venue/);

assert.equal(BUSINESS_LEGAL_QUOTE_CARDS_ENABLED, false);
assert.match(view, /BUSINESS_LEGAL_QUOTE_CARDS_ENABLED/);
assert.doesNotMatch(view, /16-what-law-says\.webp/);

assert.equal(BUSINESS_SEO_ARTICLES.length, 0);
assert.equal(buildBusinessSeoArticlePath("example"), "/b/example");
assert.doesNotMatch(view, /\/guides\/|\/articles\//);

const copy = listBusinessLandingCopy().join("\n");
assert.doesNotMatch(copy, /Audiolad Business/i);
assert.doesNotMatch(copy, /без РАО|без ВОИС/);
assert.doesNotMatch(copy, /\d[\d\s]*₽|\d[\d\s]*руб/);
assert.equal(
  copy.includes("Без надоедливых повторов и лишних забот. Работает даже без интернета."),
  true,
);
assert.match(copy, /7 дней бесплатно/);
assert.match(copy, /Без привязки карты/);
assert.match(copy, /Музыка не надоедает/);
assert.match(copy, /Интернет пропал – музыка продолжает играть/);
assert.match(copy, /7 дней бесплатно · без привязки карты/);
assert.match(copy, /Без повторов одних и тех же треков/);
assert.match(copy, /Музыка подобрана под выбранную атмосферу/);
assert.doesNotMatch(copy, /\u2014/);
assert.doesNotMatch(copy, /Создать мой эфир|эфир|опубликованн|условия под рукой|пока не/);
assert.doesNotMatch(view, /штрафов не будет|Создать мой эфир|эфир|Про иллюстрацию|не обещаем/);
assert.match(copy, /Подобрать музыку/);
assert.match(view, /BUSINESS_PICK_LABEL/);
assert.match(view, /Как звучит ваш бизнес\?/);
assert.match(view, /business-trust/);
assert.match(view, /business-header__menu/);
assert.match(view, /data-business-hero="banner"/);
assert.match(view, /business-hero-banner__visual/);
assert.match(view, /file="01-business-music\.webp"/);
assert.doesNotMatch(view, /className="business-hero"/);

const businessCss = read("src/components/business/business-landing.css");
assert.match(businessCss, /min\(1200px,\s*calc\(100% - 80px\)\)/);
assert.doesNotMatch(businessCss, /1440px/);
assert.doesNotMatch(businessCss, /100dvh - 92px/);
assert.doesNotMatch(businessCss, /minmax\(340px,\s*440px\)/);
assert.match(businessCss, /\.business-hero-banner__visual\s*\{[^}]*inset:\s*0 0 0 36%/);
assert.match(
  businessCss,
  /\.business-hero-banner__photo\s*\{[^}]*width:\s*calc\(100% \/ 0\.34\)/,
);
assert.match(businessCss, /translateY\(-12%\)/);
assert.match(businessCss, /right:\s*calc\(100% \* -0\.04 \/ 0\.34\)/);

const businessUiFiles = [
  "src/components/business/BusinessLandingView.tsx",
  "src/components/business/BusinessInquiryForm.tsx",
  "src/components/business/BusinessListenStudio.tsx",
  "src/components/business/BusinessListenRail.tsx",
  "src/components/business/BusinessSnapCarousel.tsx",
  "src/components/business/BusinessSocialProofSlot.tsx",
  "src/components/business/business-landing.css",
  "src/lib/business/landing.ts",
  "src/lib/business/metadata.ts",
  "src/lib/business/listen-selection.ts",
];
for (const relativePath of businessUiFiles) {
  const source = read(relativePath);
  assert.doesNotMatch(source, /\u2014/, `${relativePath} uses an em dash`);
  assert.doesNotMatch(source, /Audiolad Business/i, relativePath);
}
const studio = read("src/components/business/BusinessListenStudio.tsx");
assert.match(studio, /Музыка подобрана под выбранную атмосферу|BUSINESS_LISTEN_MATCHED/);
assert.match(studio, /Послушать музыку|BUSINESS_LISTEN_PLAY/);
assert.match(studio, /Салон красоты|beauty/);
assert.doesNotMatch(studio, /\u2014/);
assert.doesNotMatch(read("src/components/business/BusinessListenRail.tsx"), /\u2014/);
assert.doesNotMatch(read("src/lib/business/landing.ts"), /\u2014/);
assert.match(view, /id="variety"/);
assert.match(view, /id="offline"/);
assert.match(view, /id="network"/);
assert.match(read("src/components/business/BusinessSocialProofSlot.tsx"), /return null/);
assert.equal(
  BUSINESS_FAQ.some((item) => item.question.includes("РАО") && item.question.includes("ВОИС")),
  true,
);

const inquiryErrors = validateBusinessInquiry({
  name: "",
  email: "not-an-email",
  company: "",
  locations: "0",
  message: "",
});
assert.equal(hasBusinessInquiryErrors(inquiryErrors), true);

const mailto = buildBusinessInquiryMailto({
  name: "Анна",
  email: "anna@example.com",
  company: "Кафе",
  locations: "3",
  message: "Две точки в городе",
});
const decodedMailto = decodeURIComponent(mailto.replace(/\+/g, "%20"));
assert.match(mailto, new RegExp(`^mailto:${BUSINESS_INQUIRY_EMAIL}\\?`));
assert.match(decodedMailto, /Количество точек: 3/);
assert.match(decodedMailto, /Аудиолад Бизнес/);

const selected = selectBusinessListenCandidates([
  {
    id: "practice",
    title: "Спокойная медитация",
    productKind: "practice",
    isFree: true,
    authorSlug: "author",
    slug: "meditation",
    audioCount: 1,
  },
  {
    id: "paid-jazz",
    title: "Мягкий джаз для зала",
    productKind: "music",
    isFree: false,
    authorSlug: "author",
    slug: "jazz",
    audioCount: 2,
  },
  {
    id: "free-spa",
    title: "SPA piano",
    subtitle: "спокойное пиано",
    productKind: "music",
    isFree: true,
    authorSlug: "author",
    slug: "spa",
    audioCount: 1,
  },
  {
    id: "silent",
    title: "Lounge",
    productKind: "music",
    isFree: true,
    authorSlug: "author",
    slug: "lounge",
    audioCount: 0,
  },
  {
    id: "no-slug",
    title: "Background music",
    productKind: "music",
    isFree: true,
    authorSlug: "",
    slug: "bg",
    audioCount: 1,
  },
]);

assert.deepEqual(selected.map((item) => item.id), ["free-spa", "paid-jazz"]);

assert.match(read("src/lib/seo/sitemap-data.ts"), /path:\s*"\/b"/);

const linkedSources = BUSINESS_SOURCES.filter((source) => source.href);
assert.ok(linkedSources.length >= 3);
for (const source of linkedSources) {
  assert.match(source.href ?? "", /^https?:\/\//);
}
assert.equal(BUSINESS_SOURCES.find((source) => source.id === "rbc")?.href, null);
assert.equal(BUSINESS_SOURCES.find((source) => source.id === "kommersant")?.href, null);
assert.equal(BUSINESS_SOURCES.find((source) => source.id === "rospatent")?.href, null);

assert.match(read("src/components/business/BusinessListenRail.tsx"), /HomeProductPlayButton/);
assert.doesNotMatch(view, /<audio[\s>]/);
assert.doesNotMatch(read("src/components/business/BusinessListenRail.tsx"), /new Audio\(/);

console.log("business-landing-unit: ok");
