#!/usr/bin/env node
/**
 * Audio Post public page: share the ordinary product-page container contract
 * and keep Next Step above About / FAQ / author recommendations.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

/**
 * Documented public-page section keys after the unchanged hero.
 * FAQ is included only when FAQ data exists.
 */
function resolveAudioPostAfterHeroSectionOrder({
  hasFaq = false,
  hasAuthorRecommendations = false,
} = {}) {
  const order = ["thank-author", "next-step", "about"];
  if (hasFaq) {
    order.push("faq");
  }
  if (hasAuthorRecommendations) {
    order.push("author-recommendations");
  }
  order.push("footer");
  return order;
}

assert.deepEqual(
  resolveAudioPostAfterHeroSectionOrder(),
  ["thank-author", "next-step", "about", "footer"],
  "FAQ and recommendations stay off when those datasets are empty",
);
assert.deepEqual(
  resolveAudioPostAfterHeroSectionOrder({ hasFaq: true }),
  ["thank-author", "next-step", "about", "faq", "footer"],
);
assert.deepEqual(
  resolveAudioPostAfterHeroSectionOrder({
    hasFaq: true,
    hasAuthorRecommendations: true,
  }),
  [
    "thank-author",
    "next-step",
    "about",
    "faq",
    "author-recommendations",
    "footer",
  ],
);
assert.deepEqual(
  resolveAudioPostAfterHeroSectionOrder({ hasAuthorRecommendations: true }),
  ["thank-author", "next-step", "about", "author-recommendations", "footer"],
  "recommendations stay available without inventing a FAQ block",
);

const practicePage = read(
  "src/components/products/practice-page/PracticePageContent.tsx",
);
const practiceLayout = read(
  "src/app/(platform)/(listener)/practice/[...segments]/layout.tsx",
);
const audioPostPage = read("src/components/products/audio-post/AudioPostPage.tsx");
const seoSections = read(
  "src/components/products/PracticeSeoContentSections.tsx",
);

const PRACTICE_OUTER_WRAPPER =
  "min-w-0 ${platformBottomContentPaddingClass}";
const PRACTICE_INNER_WRAPPER =
  "pt-6 xl:box-border xl:min-w-0 xl:max-w-full xl:px-6 xl:pt-3";

assert.match(
  practiceLayout,
  /listener-practice-content px-5 pb-6 pt-0 lg:px-10 xl:px-0 xl:pb-8 xl:pt-0/,
  "ordinary product and audio post share the practice route layout gutters",
);
assert.match(
  practicePage,
  new RegExp(
    `className=\\{\\\`${PRACTICE_OUTER_WRAPPER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\\`\\}`,
  ),
  "reference product wrapper: outer min-w-0 + bottom padding",
);
assert.match(
  practicePage,
  new RegExp(`className="${PRACTICE_INNER_WRAPPER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
  "reference product wrapper: inner pt-6 / xl:px-6, no max-w-3xl",
);

assert.match(
  audioPostPage,
  new RegExp(
    `className=\\{\\\`${PRACTICE_OUTER_WRAPPER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\\`\\}`,
  ),
  "audio post reuses the product-page outer wrapper",
);
assert.match(
  audioPostPage,
  new RegExp(`className="${PRACTICE_INNER_WRAPPER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
  "audio post reuses the product-page inner wrapper",
);
assert.doesNotMatch(
  audioPostPage,
  /max-w-3xl/,
  "audio post must not add a narrower max-width than the product page",
);
assert.doesNotMatch(
  audioPostPage,
  /mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6/,
  "audio post must not stack extra mobile gutters on the practice layout",
);

const trailingStart = audioPostPage.indexOf("function AudioPostTrailingSections");
const trailingEnd = audioPostPage.indexOf(
  "export default function AudioPostPage",
);
assert.ok(trailingStart >= 0 && trailingEnd > trailingStart);
const trailing = audioPostPage.slice(trailingStart, trailingEnd);

const markers = [
  ["thank-author", "AuthorAppreciationPrototype"],
  ["next-step", "AudioPostRecommendation"],
  ["about", "ProductCopySections"],
  ["seo-faq-recommendations", "PracticeSeoContentSections"],
  ["footer", "LegalFooter"],
];
const markerIndexes = markers.map(([key, token]) => {
  const index = trailing.indexOf(token);
  assert.ok(index >= 0, `trailing stack must include ${key} (${token})`);
  return { key, token, index };
});
for (let i = 1; i < markerIndexes.length; i += 1) {
  assert.ok(
    markerIndexes[i - 1].index < markerIndexes[i].index,
    `${markerIndexes[i - 1].key} must precede ${markerIndexes[i].key}`,
  );
}

assert.equal(
  (audioPostPage.match(/<NextStepRecommendation/g) || []).length,
  1,
  "exactly one Next Step component",
);
assert.equal(
  (audioPostPage.match(/<AudioPostRecommendation/g) || []).length,
  1,
  "exactly one Next Step helper in the shared trailing stack",
);
assert.equal(
  (audioPostPage.match(/<PracticeSeoContentSections/g) || []).length,
  1,
  "exactly one author-recommendations / FAQ mount path",
);
assert.equal(
  (audioPostPage.match(/<AudioPostTrailingSections/g) || []).length,
  2,
  "mobile and desktop share the same after-hero order",
);

assert.match(
  seoSections,
  /content\.faqItems\.length \? \(/,
  "FAQ stays schema-backed and renders only when FAQ data exists",
);
assert.match(
  seoSections,
  /AuthorRecommendationsSection/,
  "author recommendations stay in the shared SEO stack for audio post",
);
assert.match(
  seoSections,
  /includeRelatedProducts = true/,
  "audio post default still includes related products after FAQ",
);

const seoRender = seoSections.slice(seoSections.indexOf("return ("));
const faqBranch = seoRender.indexOf("content.faqItems.length");
const recommendationsBranch = seoRender.indexOf(
  "<AuthorRecommendationsSection",
);
assert.ok(faqBranch >= 0 && recommendationsBranch > faqBranch);

const faqHeading = seoRender.indexOf("Вопросы и ответы");
if (faqHeading >= 0) {
  assert.ok(
    faqHeading < recommendationsBranch,
    "when FAQ markup exists, it stays before author recommendations",
  );
}

assert.doesNotMatch(
  audioPostPage,
  /Вопросы и ответы/,
  "audio post must not hardcode FAQ; it reuses the conditional SEO sections",
);

console.log("audio-post-layout-unit: ok");
