#!/usr/bin/env node
/**
 * Ordinary practice/product page funnel order:
 * listen → rate → thank author → topics → author recommendations → long SEO.
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
 * Documented public-page section keys after the hero listen CTA.
 * Conditional blocks stay off when their datasets are empty.
 */
function resolvePracticePageFunnelOrder({
  hasRating = false,
  hasThankAuthor = false,
  hasTopics = false,
  hasAuthorRecommendations = false,
  hasAbout = false,
  hasUsage = false,
  hasFaq = false,
  hasListeningNotice = false,
} = {}) {
  const order = ["hero"];
  if (hasRating) {
    order.push("rating");
  }
  if (hasThankAuthor) {
    order.push("thank-author");
  }
  if (hasTopics) {
    order.push("topics");
  }
  if (hasAuthorRecommendations) {
    order.push("author-recommendations");
  }
  if (hasAbout) {
    order.push("about");
  }
  if (hasUsage) {
    order.push("usage");
  }
  if (hasFaq) {
    order.push("faq");
  }
  if (hasListeningNotice) {
    order.push("listening-notice");
  }
  order.push("footer");
  return order;
}

assert.deepEqual(
  resolvePracticePageFunnelOrder(),
  ["hero", "footer"],
  "conditional sections stay off when those datasets are empty",
);
assert.deepEqual(
  resolvePracticePageFunnelOrder({
    hasRating: true,
    hasThankAuthor: true,
    hasTopics: true,
    hasAuthorRecommendations: true,
    hasAbout: true,
    hasUsage: true,
    hasFaq: true,
    hasListeningNotice: true,
  }),
  [
    "hero",
    "rating",
    "thank-author",
    "topics",
    "author-recommendations",
    "about",
    "usage",
    "faq",
    "listening-notice",
    "footer",
  ],
);
assert.deepEqual(
  resolvePracticePageFunnelOrder({
    hasRating: true,
    hasAbout: true,
    hasUsage: true,
    hasListeningNotice: true,
  }),
  ["hero", "rating", "about", "usage", "listening-notice", "footer"],
  "thank-author, topics, recommendations and FAQ stay off when data is absent",
);
assert.deepEqual(
  resolvePracticePageFunnelOrder({
    hasAuthorRecommendations: true,
    hasAbout: true,
  }),
  ["hero", "author-recommendations", "about", "footer"],
  "author recommendations precede «О продукте» when both exist",
);

const practiceContent = read(
  "src/components/products/practice-page/PracticePageContent.tsx",
);
const practiceParts = read(
  "src/components/products/practice-page/PracticePageParts.tsx",
);
const practiceHero = read(
  "src/components/products/practice-page/PracticeProductHero.tsx",
);
const seoSections = read(
  "src/components/products/PracticeSeoContentSections.tsx",
);
const recommendations = read(
  "src/components/products/AuthorRecommendationsSection.tsx",
);
const topics = read("src/components/products/ProductTopicLinks.tsx");
const copySections = read("src/components/products/ProductCopySections.tsx");
const rating = read(
  "src/components/products/practice-page/PracticeRatingStars.tsx",
);
const audioPost = read("src/components/products/audio-post/AudioPostPage.tsx");

const markers = [
  ["hero", 'data-practice-section="hero"'],
  ["rating", "PracticeRatingStars"],
  ["thank-author", 'data-practice-section="thank-author"'],
  ["topics", "ProductTopicLinks"],
  ["author-recommendations", "AuthorRecommendationsSection"],
  ["about", "ProductCopySections"],
  ["seo-usage-faq", "PracticeSeoContentSections"],
  ["listening-notice", "ListeningNoticeCard"],
  ["footer", "LegalFooter"],
];

const markerIndexes = markers.map(([key, token]) => {
  const index = practiceContent.indexOf(token);
  assert.ok(index >= 0, `practice tree must include ${key} (${token})`);
  return { key, token, index };
});
for (let i = 1; i < markerIndexes.length; i += 1) {
  assert.ok(
    markerIndexes[i - 1].index < markerIndexes[i].index,
    `${markerIndexes[i - 1].key} must precede ${markerIndexes[i].key}`,
  );
}

assert.equal(
  (practiceContent.match(/<PracticeProductHero/g) || []).length,
  1,
  "exactly one hero",
);
assert.equal(
  (practiceContent.match(/<PracticeRatingStars/g) || []).length,
  1,
  "exactly one rating mount",
);
assert.equal(
  (practiceContent.match(/<AuthorAppreciationPrototype/g) || []).length,
  1,
  "exactly one thank-author mount",
);
assert.equal(
  (practiceContent.match(/<ProductTopicLinks/g) || []).length,
  1,
  "exactly one topics mount",
);
assert.equal(
  (practiceContent.match(/<AuthorRecommendationsSection/g) || []).length,
  1,
  "exactly one author-recommendations mount",
);
assert.equal(
  (practiceContent.match(/<ProductCopySections/g) || []).length,
  1,
  "exactly one about mount",
);
assert.equal(
  (practiceContent.match(/<PracticeSeoContentSections/g) || []).length,
  1,
  "exactly one usage/FAQ SEO mount",
);
assert.equal(
  (practiceContent.match(/<ListeningNoticeCard/g) || []).length,
  1,
  "exactly one listening-notice mount",
);
assert.equal(
  (practiceContent.match(/<LegalFooter/g) || []).length,
  1,
  "exactly one footer mount",
);

assert.match(
  practiceContent,
  /ratingsUiEnabled \? \(/,
  "rating stays conditional on the ratings UI flag",
);
assert.match(
  practiceContent,
  /showThankAuthor \? \(/,
  "thank-author stays conditional on appreciation visibility + author name",
);
assert.match(
  practiceContent,
  /listeningNotice \? \(/,
  "listening notice stays conditional",
);
assert.match(
  practiceContent,
  /includeRelatedProducts=\{false\}/,
  "practice SEO stack must not remount author recommendations after FAQ",
);

assert.doesNotMatch(
  practiceParts,
  /AuthorAppreciationPrototype/,
  "thank-author is no longer inside the hero CTA stack",
);
assert.doesNotMatch(
  practiceParts,
  /hero-stack|practice-product-hero__cta--with-appreciation/,
  "hero no longer uses the stacked appreciation variant",
);
assert.doesNotMatch(
  practiceHero,
  /AuthorAppreciationPrototype|ProductTopicLinks/,
  "hero stays cover / type / title / subtitle / author · duration / listen CTA",
);

assert.match(
  practiceContent,
  /surface="product"/,
  "practice thank-author reuses the existing product appreciation surface",
);
assert.doesNotMatch(
  practiceContent,
  /layout="hero-stack"/,
  "practice thank-author uses the default rounded card, not hero-stack",
);

assert.match(topics, /data-practice-section="topics"/);
assert.match(topics, /min-h-11/);
assert.match(topics, /rounded-full/);
assert.match(topics, /text-xs/);
assert.match(topics, /px-3 py-1\.5/);
assert.doesNotMatch(
  topics,
  /px-4 py-2 text-sm/,
  "topic chips are compact: smaller type and padding",
);

assert.match(rating, /data-practice-section="rating"/);
assert.match(copySections, /data-practice-section="about"/);
assert.match(recommendations, /data-practice-section="author-recommendations"/);
assert.match(recommendations, /RelatedProductLinkCard/);
assert.match(recommendations, /authorRecommendationsTitle/);
assert.match(recommendations, /relatedProducts\.length/);
assert.doesNotMatch(
  recommendations,
  /fetch\(|useEffect|analytics/,
  "recommendation cards stay presentational; no new selection or analytics",
);

assert.match(seoSections, /includeRelatedProducts = true/);
assert.match(seoSections, /data-practice-section="usage"/);
assert.match(seoSections, /data-practice-section="faq"/);
assert.match(seoSections, /content\.faqItems\.length \? \(/);
assert.match(seoSections, /content\.usageItems\.length \? \(/);

const usageBranch = seoSections.indexOf('data-practice-section="usage"');
const faqBranch = seoSections.indexOf('data-practice-section="faq"');
assert.ok(usageBranch >= 0 && faqBranch > usageBranch);

assert.match(
  audioPost,
  /<PracticeSeoContentSections/,
  "audio post still reuses the shared SEO sections",
);
assert.doesNotMatch(
  audioPost,
  /includeRelatedProducts=\{false\}/,
  "audio post keeps author recommendations inside the shared SEO stack",
);
assert.equal(
  (audioPost.match(/<AuthorAppreciationPrototype/g) ?? []).length,
  1,
  "audio post thank-author remains a single after-hero card",
);

console.log("practice-page-funnel-order-unit: ok");
