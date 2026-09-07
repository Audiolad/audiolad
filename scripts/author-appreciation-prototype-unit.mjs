#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const prototype = read(
  "src/components/author-appreciation/AuthorAppreciationPrototype.tsx",
);
const APPRECIATION_CTA = "❤️ Поблагодарить автора";
const APPRECIATION_CAPTION = "Благодарность возвращается изобилием 🙏";
const DESKTOP_CAPTION_FONT_PX = 14; // Tailwind text-sm
const MOBILE_CAPTION_FONT_PX = DESKTOP_CAPTION_FONT_PX - 1;

assert.ok(prototype.includes(APPRECIATION_CTA));
assert.ok(prototype.includes(APPRECIATION_CAPTION));
assert.ok(!prototype.includes("🙏 Поблагодарить автора ❤️"));
assert.ok(!prototype.includes("🙏 Поблагодарить автора"));
assert.ok(!prototype.includes("Поблагодарить автора ❤️"));
assert.match(
  prototype,
  /<p className="author-appreciation-caption mt-2\.5 text-sm leading-5 text-\[#7d70a2\]">/,
  "desktop/tablet caption keeps text-sm; only the dedicated class is added",
);
assert.ok(
  !/author-appreciation-caption[^>]*(whitespace-nowrap|nowrap)/.test(prototype),
  "caption must wrap on very narrow screens instead of overflowing",
);
assert.ok(prototype.includes("FEATURED_CARD_PRIMARY_CTA_CLASS"));
assert.ok(prototype.includes("author-appreciation-cta"));
assert.ok(prototype.includes("author-appreciation-cta__heart"));
assert.ok(
  prototype.indexOf("author-appreciation-cta__heart") <
    prototype.indexOf("APPRECIATION_CTA_LABEL.slice"),
  "heart class must wrap the leading ❤️ before the remaining CTA text",
);
assert.ok(
  prototype.indexOf("author-appreciation-cta__heart") <
    prototype.indexOf("Благодарность возвращается изобилием 🙏"),
);
assert.ok(
  prototype.indexOf("</button>") <
    prototype.indexOf("Благодарность возвращается изобилием 🙏"),
  "caption must stay a separate non-clickable line under the button",
);
assert.ok(
  prototype.indexOf("🙏") > prototype.indexOf("</button>"),
  "folded-hands emoji belongs to the caption, not the CTA button",
);
assert.ok(
  !prototype
    .slice(
      prototype.indexOf("author-appreciation-cta__heart"),
      prototype.indexOf("</button>"),
    )
    .includes("🙏"),
  "caption 🙏 must not be wrapped by the heart pulse class",
);
assert.ok(prototype.includes('surface: "author" | "product"'));
assert.ok(prototype.includes('layout?: "card" | "hero-stack"'));
assert.ok(prototype.includes("event.stopPropagation()"));
assert.ok(prototype.includes('type="button"'));
assert.ok(prototype.includes('role="dialog"'));
assert.ok(prototype.includes('aria-modal="true"'));
assert.ok(prototype.includes("items-end"));
assert.ok(prototype.includes("sm:items-center"));
assert.ok(prototype.includes("env(safe-area-inset-bottom)"));
assert.ok(prototype.includes('!isAuthenticated ? ('));
assert.ok(prototype.includes("Email для получения чека"));
assert.ok(prototype.includes("100, 300, 500, 1000"));
assert.ok(prototype.includes("parseAppreciationAmount"));
assert.ok(prototype.includes('useState("500")'));
assert.ok(prototype.includes("setAmountInput(String(quickAmount))"));
assert.ok(prototype.includes("selectedAmount === quickAmount"));
assert.ok(prototype.includes("Сумма"));
assert.ok(prototype.includes("Выберите сумму или введите вручную"));
assert.ok(
  !/>\s*Выберите сумму\s*</.test(prototype),
  "old standalone amount-picker label must not remain",
);
assert.ok(!prototype.includes("Своя сумма"));
assert.ok(prototype.includes("Поблагодарить на {resolveAmountLabel(selectedAmount)}"));
assert.ok(prototype.includes("amount_minor: selectedAmount * 100"));
assert.ok(prototype.includes("Вы перейдёте на защищённую страницу оплаты."));
assert.ok(!prototype.includes("GetCourse"));
assert.ok(prototype.includes('fetch("/api/author-appreciation/checkout"'));
assert.ok(prototype.includes("idempotency-key"));
assert.ok(!prototype.includes("—"), "use en-dash, not em-dash");

const authorPage = read(
  "src/app/(platform)/(listener)/authors/[slug]/page.tsx",
);
assert.ok(authorPage.includes('author_appreciation_preview?: string'));
assert.ok(authorPage.includes("resolveAuthorAppreciationVisibility"));
assert.ok(
  authorPage.indexOf("<AuthorAppreciationPrototype") <
    authorPage.indexOf("<AuthorFeaturedSection"),
  "author block must follow the public header and precede featured products",
);

const practicePage = read(
  "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
);
assert.ok(practicePage.includes('author_appreciation_preview?: string'));
assert.ok(practicePage.includes("resolveAuthorAppreciationVisibility"));
assert.ok(practicePage.includes("isMusicProductKind"));
assert.ok(practicePage.includes("showAuthorAppreciationPrototype"));
assert.ok(
  practicePage.includes("isAppreciationProductEligible") ||
    practicePage.includes("resolveAuthorAppreciationVisibility"),
  "music shares the practice PDP visibility path",
);

const practiceContent = read(
  "src/components/products/practice-page/PracticePageContent.tsx",
);
assert.ok(
  practiceContent.includes("<AuthorAppreciationPrototype"),
  "practice appreciation is a separate card on the ordinary product page",
);
assert.ok(
  !practiceContent.includes('layout="hero-stack"'),
  "practice thank-author uses the default rounded card, not the hero-stack variant",
);
assert.ok(
  practiceContent.indexOf("<PracticeRatingStars") <
    practiceContent.indexOf("<AuthorAppreciationPrototype"),
  "thank-author card sits after rating",
);
assert.ok(
  practiceContent.indexOf("<AuthorAppreciationPrototype") <
    practiceContent.indexOf("<ProductTopicLinks"),
  "thank-author card sits before topics",
);
assert.equal(
  (practiceContent.match(/<AuthorAppreciationPrototype/g) ?? []).length,
  1,
  "exactly one thank-author mount on the ordinary product page",
);

const practiceParts = read(
  "src/components/products/practice-page/PracticePageParts.tsx",
);
const actionSection = practiceParts.slice(
  practiceParts.indexOf("export function PracticePrimaryActionSection"),
);
assert.ok(!actionSection.includes("<AuthorAppreciationPrototype"));
assert.ok(!actionSection.includes('layout="hero-stack"'));
assert.ok(!actionSection.includes("practice-product-hero__cta--with-appreciation"));
assert.ok(
  prototype.includes("event.stopPropagation()") &&
    prototype.includes("event.preventDefault()"),
  "appreciation click must not change playback",
);
assert.ok(prototype.includes('type="button"'));
assert.ok(
  !actionSection.includes("flex-row") &&
    actionSection.includes("PracticeListenCtaLink"),
  "hero CTA column stays vertical after appreciation leaves the hero",
);

const audioPost = read("src/components/products/audio-post/AudioPostPage.tsx");
assert.equal(
  (audioPost.match(/<AuthorAppreciationPrototype/g) ?? []).length,
  1,
  "audio post appreciation is defined once in the shared after-hero stack",
);
assert.equal(
  (audioPost.match(/<AudioPostTrailingSections/g) ?? []).length,
  2,
  "audio post needs mobile and desktop placements",
);

const globalsCss = read("src/app/globals.css");
assert.ok(globalsCss.includes(".author-appreciation-cta"));
assert.ok(globalsCss.includes("author-appreciation-cta-breathe"));
assert.ok(globalsCss.includes("author-appreciation-cta-heart"));
assert.ok(globalsCss.includes("author-appreciation-cta-glow"));
assert.ok(globalsCss.includes("author-appreciation-cta-sheen"));
assert.match(
  globalsCss,
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.author-appreciation-cta,[\s\S]*?animation:\s*none/,
);
const mobileCaptionBlock =
  /@media \(max-width: 767px\) \{\s*\.author-appreciation-caption\s*\{([^}]+)\}/;
const mobileCaptionRule = globalsCss.match(mobileCaptionBlock);
assert.ok(mobileCaptionRule, "mobile caption font rule must use the 767px breakpoint");
assert.match(
  mobileCaptionRule[1],
  new RegExp(`font-size:\\s*${MOBILE_CAPTION_FONT_PX}px`),
  `mobile caption must be exactly ${MOBILE_CAPTION_FONT_PX}px (text-sm ${DESKTOP_CAPTION_FONT_PX}px minus 1px)`,
);
assert.match(
  mobileCaptionRule[1],
  /line-height:\s*1\.25rem/,
  "mobile caption keeps leading-5 so the line stays visually neat",
);
assert.ok(
  !/white-space:\s*nowrap/.test(mobileCaptionRule[1]),
  "mobile caption must not force nowrap",
);
const captionCssOutsideMobile = globalsCss.replace(mobileCaptionBlock, "");
assert.ok(
  !/\.author-appreciation-caption\s*\{[^}]*font-size:/.test(captionCssOutsideMobile),
  "tablet/desktop caption font-size stays Tailwind text-sm",
);

console.log("author-appreciation-prototype-unit: ok");
