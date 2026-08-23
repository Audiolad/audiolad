#!/usr/bin/env node
/**
 * GEO/AEO Stage 2A-2 — article-to-topic reconciliation. No DB, no network.
 */
import {
  getArticleBySlug,
  listArticleDefinitions,
  listArticlesByTopicSlug,
} from "../src/lib/seo/articles/index.ts";
import { listListenPageDefinitions } from "../src/lib/seo/listens/index.ts";
import { listTopicHubSlugs } from "../src/lib/seo/topic-hubs/index.ts";

const EXISTING_HUBS = [
  "lyubov-k-sebe",
  "zhenskaya-energiya",
  "besplatnye-meditatsii",
  "meditatsii-na-dengi",
  "izobilie",
];

const EXPECTED_COUNTS = {
  "lyubov-k-sebe": 6,
  "zhenskaya-energiya": 6,
  "besplatnye-meditatsii": 1,
  "meditatsii-na-dengi": 24,
  "izobilie": 7,
};

const REMOVE_SLUGS = [
  "kak-otpustit-obidu",
  "kak-otpustit-proshloe",
  "kak-perestat-zlitsya-na-cheloveka",
  "kak-ponyat-chego-ya-hochu",
  "kak-pravilno-sformulirovat-zhelanie",
  "kak-prostit-cheloveka",
  "meditatsiya-na-ispolnenie-zhelaniy",
  "namerenie-chto-eto",
  "pochemu-my-postoyanno-obizhaemsya",
  "pochemu-zhelaniya-ne-ispolnyayutsya",
  "vizualizatsiya-zhelaniy",
];

const DIVORCE_SLUGS = [
  "kak-otpustit-byvshego-muzha",
  "kak-perezhit-izmenu-i-razvod",
  "kak-perezhit-razvod",
  "kak-perezhit-razvod-muzhchine",
  "kak-perezhit-razvod-s-muzhem",
  "kak-pomoch-rebenku-perezhit-razvod-roditeley",
  "kak-ponyat-chto-pora-razvoditsya",
  "kak-reshitsya-na-razvod",
  "kak-skazat-rebenku-o-razvode-roditeley",
  "lichnaya-zhizn-posle-razvoda",
  "novaya-zhizn-posle-razvoda",
  "novye-otnosheniya-posle-razvoda",
  "odinochestvo-posle-razvoda",
  "otnosheniya-s-byvshim-posle-razvoda",
  "rebenok-i-razvod-roditeley",
  "zhizn-muzhchiny-posle-razvoda",
  "zhizn-posle-razvoda",
  "zhizn-posle-razvoda-s-rebenkom",
  "zhizn-zhenshchiny-posle-razvoda",
];

const B2B_SLUGS = [
  "blog-psikhologa",
  "chastnaya-praktika-psikhologa",
  "kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
  "kak-napisat-tekst-meditatsii",
  "kak-prodavat-svoi-uslugi",
  "kak-psikhologu-nayti-klientov",
  "kak-psikhologu-zarabotat",
  "kak-sozdat-svoyu-meditatsiyu",
  "kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
  "kak-zapisat-meditatsiyu-samostoyatelno",
  "kontent-dlya-psikhologa",
  "lichnyy-brend-psikhologa",
  "lid-magnit-dlya-psikhologa",
  "meditatsii-dlya-klientov-psikhologa",
  "obuchenie-sozdaniyu-meditatsiy",
  "prilozhenie-dlya-zapisi-meditatsiy",
  "prodazhi-psikhologa",
  "prodvizhenie-astrologa",
  "prodvizhenie-ezoterika",
  "prodvizhenie-konsultanta",
  "prodvizhenie-koucha",
  "prodvizhenie-nastavnika",
  "prodvizhenie-psikhologa",
  "prodvizhenie-tarologa",
  "produkty-psikhologa",
  "reklama-psikhologa",
  "reklama-tarologa",
  "skolko-zarabatyvaet-kouch",
  "sozdanie-muzyki-dlya-meditatsiy",
];

const MONEY_LISTEN_SLUGS = [
  "meditatsiya-na-dengi-slushat-onlayn-besplatno",
  "denezhnaya-meditatsiya-slushat-onlayn-besplatno",
  "meditatsiya-na-bogatstvo-slushat-onlayn",
  "meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya",
  "meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno",
  "meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn",
  "meditatsiya-na-dengi-i-izobilie-dlya-zhenshchin",
  "utrennyaya-meditatsiya-na-dengi-i-izobilie",
];

const IZOBILIE_LISTEN_SLUGS = [
  "meditatsiya-na-izobilie-slushat-onlayn-besplatno",
];

const SLEEP_LISTEN_SLUGS = [
  "meditatsiya-dlya-zasypaniya-slushat-onlayn",
  "meditatsiya-dlya-sna-ot-stressa-i-trevogi",
  "meditatsiya-dlya-sna-i-vosstanovleniya-sil",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function slugsOf(topicSlug) {
  return listArticlesByTopicSlug(topicSlug)
    .map((article) => article.slug)
    .sort();
}

function testHubArticleCounts() {
  for (const [hub, count] of Object.entries(EXPECTED_COUNTS)) {
    const actual = listArticlesByTopicSlug(hub);
    assert(
      actual.length === count,
      `${hub} article count: expected ${count}, got ${actual.length}`,
    );
  }

  assert(
    slugsOf("besplatnye-meditatsii").join(",") ===
      "besplatnye-meditatsii-onlayn",
    "free hub keeps only besplatnye-meditatsii-onlayn",
  );
}

function testRemovedArticlesLeaveExistingHubs() {
  const hubSlugs = new Set(
    EXISTING_HUBS.flatMap((hub) => slugsOf(hub)),
  );

  assert(REMOVE_SLUGS.length === 11, "REMOVE list is 11 articles");

  for (const slug of REMOVE_SLUGS) {
    const article = getArticleBySlug(slug);
    assert(article, `${slug} still registered`);
    assert(
      article.topicSlug === "pending-hub-reconciliation",
      `${slug} uses pending-hub-reconciliation`,
    );
    assert(article.topicTitle === "Статьи", `${slug} topicTitle is Статьи`);
    assert(article.topicHref === "/articles", `${slug} topicHref is /articles`);
    assert(!hubSlugs.has(slug), `${slug} is not in any of the five hubs`);
  }
}

function testDivorceArticlesUnchanged() {
  assert(DIVORCE_SLUGS.length === 19, "divorce cluster stays 19");

  for (const slug of DIVORCE_SLUGS) {
    const article = getArticleBySlug(slug);
    assert(article, `${slug} divorce article registered`);
    assert(
      article.topicSlug === "pending-hub-reconciliation",
      `${slug} stays pending`,
    );
    assert(article.topicTitle === "Статьи", `${slug} topicTitle unchanged`);
    assert(article.topicHref === "/articles", `${slug} topicHref unchanged`);
  }

  const pending = slugsOf("pending-hub-reconciliation");
  for (const slug of DIVORCE_SLUGS) {
    assert(pending.includes(slug), `${slug} still pending`);
  }
}

function testB2BArticlesUnchanged() {
  assert(B2B_SLUGS.length === 29, "B2B cluster stays 29");

  for (const slug of B2B_SLUGS) {
    const article = getArticleBySlug(slug);
    assert(article, `${slug} B2B article registered`);
    assert(article.topicSlug === "articles", `${slug} stays on articles sentinel`);
    assert(article.topicTitle === "Статьи", `${slug} B2B topicTitle unchanged`);
    assert(article.topicHref === "/articles", `${slug} B2B topicHref unchanged`);
  }
}

function testListenMappingsUnchanged() {
  const pages = listListenPageDefinitions();
  const bySlug = new Map(pages.map((page) => [page.slug, page.topicSlug]));

  for (const slug of MONEY_LISTEN_SLUGS) {
    assert(bySlug.get(slug) === "meditatsii-na-dengi", `${slug} money listen unchanged`);
  }
  for (const slug of IZOBILIE_LISTEN_SLUGS) {
    assert(bySlug.get(slug) === "izobilie", `${slug} izobilie listen unchanged`);
  }
  for (const slug of SLEEP_LISTEN_SLUGS) {
    assert(bySlug.get(slug) === undefined, `${slug} sleep listen stays unmapped`);
  }

  const mapped = pages.filter((page) => page.topicSlug);
  assert(mapped.length === 9, "exactly 9 listens stay mapped");
  assert(
    mapped.every((page) =>
      MONEY_LISTEN_SLUGS.includes(page.slug) ||
      IZOBILIE_LISTEN_SLUGS.includes(page.slug),
    ),
    "no extra listen mappings",
  );
}

function testNoNewTopicHubs() {
  const slugs = listTopicHubSlugs();
  assert(slugs.join(",") === EXISTING_HUBS.join(","), "hub registry order unchanged");
  assert(slugs.length === 5, "still exactly five topic hubs");
  assert(!slugs.includes("meditatsii-dlya-sna"), "sleep hub not created");
  assert(
    !slugs.some((slug) => slug.includes("razvod") || slug.includes("divorce")),
    "divorce hub not created",
  );
  assert(
    !slugs.some(
      (slug) =>
        slug.includes("proschen") ||
        slug.includes("zhelan") ||
        slug.includes("vizualiz"),
    ),
    "forgiveness/desire hubs not created",
  );
}

function testRegistryTotals() {
  const all = listArticleDefinitions();
  assert(all.length === 103, "article registry size unchanged");

  const fiveHubTotal = EXISTING_HUBS.reduce(
    (sum, hub) => sum + listArticlesByTopicSlug(hub).length,
    0,
  );
  assert(fiveHubTotal === 44, "five hubs now hold 44 articles");
}

const tests = [
  ["hub article counts", testHubArticleCounts],
  ["REMOVE articles leave existing hubs", testRemovedArticlesLeaveExistingHubs],
  ["divorce 19 unchanged", testDivorceArticlesUnchanged],
  ["B2B articles unchanged", testB2BArticlesUnchanged],
  ["Listen mappings unchanged", testListenMappingsUnchanged],
  ["no new topic hubs", testNoNewTopicHubs],
  ["registry totals", testRegistryTotals],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok: ${name}`);
}

console.log(`geo-aeo-stage2a2-unit: ${tests.length} checks passed`);
