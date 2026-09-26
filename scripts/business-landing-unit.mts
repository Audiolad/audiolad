import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_ASSET_FILES,
  BUSINESS_FAQ,
  BUSINESS_INQUIRY_EMAIL,
  BUSINESS_LANDING_CANONICAL,
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
  "Музыка для вашего бизнеса — быстро, просто, легально",
);
assert.equal(BUSINESS_LANDING_TITLE, "Музыка для бизнеса – Аудиолад Бизнес");
assert.equal(BUSINESS_LANDING_CANONICAL, "https://audiolad.ru/b");
assert.match(view, /<h1[\s>]/);
assert.equal((view.match(/<h1[\s>]/g) ?? []).length, 1);
assert.doesNotMatch(view, /<h1[^>]*>\s*<Image/);

const metadata = buildBusinessLandingMetadata();
assert.equal(metadata.title, BUSINESS_LANDING_TITLE);
assert.equal(metadata.alternates && "canonical" in metadata.alternates
  ? metadata.alternates.canonical
  : null, "https://audiolad.ru/b");
assert.deepEqual(metadata.robots, { index: true, follow: true });
assert.doesNotMatch(page, /noindex/);
assert.doesNotMatch(view, /noindex/);

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
assert.match(copy, /Интернет пропал — музыка продолжает играть/);
assert.doesNotMatch(copy, /Создать мой эфир|эфир|опубликованн|условия под рукой|пока не/);
assert.doesNotMatch(view, /штрафов не будет|Создать мой эфир|эфир|Про иллюстрацию|не обещаем/);
assert.match(copy, /Подобрать музыку/);
assert.match(view, /BUSINESS_PICK_LABEL/);
assert.match(view, /Как звучит ваш бизнес\?/);
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
