#!/usr/bin/env node
/**
 * Public product topic links unit checks (no DB).
 */
import { readFileSync } from "node:fs";

import { buildCatalogTopicHref } from "../src/lib/catalog/topic-filter.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const component = readFileSync(
  "src/components/products/ProductTopicLinks.tsx",
  "utf8",
);
const practicePage = readFileSync(
  "src/app/(listener)/practice/[...segments]/page.tsx",
  "utf8",
);
const practiceMobilePage = readFileSync(
  "src/components/products/practice-page/PracticePageMobile.tsx",
  "utf8",
);
const practiceTopics = readFileSync(
  "src/lib/products/practice-topics.ts",
  "utf8",
);
const topicsQueries = readFileSync("src/lib/topics/queries.ts", "utf8");
const catalogCard = readFileSync(
  "src/components/products/CatalogProductCard.tsx",
  "utf8",
);
const homeProductCard = readFileSync(
  "src/components/home/HomeProductCard.tsx",
  "utf8",
);

assert(component.includes("topics"), "component receives topics via props");
assert(!component.includes("useEffect"), "no client fetch/useEffect");
assert(!component.includes("useState"), "no client state fetch");
assert(component.includes('from "next/link"'), "uses Link");
assert(component.includes("resolveTopicPublicHref"), "uses resolveTopicPublicHref");
assert(
  buildCatalogTopicHref("money") === "/catalog?topic=money",
  "money catalog href uses topic key",
);
assert(
  component.includes("@/lib/seo/topic-hubs"),
  "topic links resolve via SEO topic hubs helper",
);
assert(!component.includes("?need="), "no legacy need links");
assert(!component.includes("HOME_NEED"), "no hardcoded topic list");
assert(component.includes("topics.length === 0"), "empty topics returns null");
assert(
  topicsQueries.includes("getActivePracticeTopics"),
  "server layer filters active topics",
);
assert(
  topicsQueries.includes("activeTopics"),
  "inactive topics excluded via getPracticeTopics split",
);
assert(
  topicsQueries.includes("sort_order") && topicsQueries.includes("title"),
  "sort order in query layer",
);
assert(
  component.includes('aria-label="Темы практики"'),
  "nav has aria-label",
);
assert(component.includes('type="button"') === false, "no button chips");
assert(!/<div[^>]*onClick/.test(component), "no div onClick");
assert(!component.includes("line-clamp"), "long titles not force truncated");
assert(!component.includes("ПОДАРОК"), "no gift label");
assert(!component.includes("absolute"), "no overlay positioning on cover");

assert(
  practicePage.includes("loadPublicPracticeTopicsSafe"),
  "public product page loads topics on server",
);
assert(
  practiceMobilePage.includes("ProductTopicLinks") ||
    practiceMobilePage.includes("PracticeMetaSection"),
  "public product page renders ProductTopicLinks",
);
assert(
  practiceTopics.includes("getActivePracticeTopics"),
  "safe loader uses active-only query",
);
assert(
  practiceTopics.includes("topics_load_failed"),
  "safe loader logs and returns empty array",
);

assert(
  !catalogCard.includes("ProductTopicLinks"),
  "catalog cards unchanged",
);
assert(
  !homeProductCard.includes("ProductTopicLinks"),
  "home cards unchanged",
);

assert(
  practicePage.includes("getPracticeByAuthorAndSlug"),
  "product access gate before topics render",
);
assert(!practicePage.includes("audio_url"), "page does not expose audio URLs in topic block");

console.log("product-topic-links-unit: ok");
