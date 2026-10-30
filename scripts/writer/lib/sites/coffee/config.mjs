// `--site coffee`: AudioLad coffee-shop guides (/b/coffee/<slug>) in Audiolad/audiolad.
// A separate template from `--site sz` (sergey-zoya.ru): own files, own id, own schema name.
// Nothing here is imported from the sz template folder and nothing there imports this folder
// (scripts/writer/coffee-unit.mjs checks both directions and the sz file hashes).
export const COFFEE = {
  site: "coffee",
  /** Pack briefs must carry exactly this template id; sz packs never do. */
  templateId: "audiolad-coffee-guide-v1",
  /** JSON schema name sent to Cloud.ru (sz uses its own). */
  schemaName: "audiolad_coffee_guide_article",
  repo: "Audiolad/audiolad",
  verticalId: "coffee",
  verticalPath: "/b/coffee",
  byline: "АудиоЛад Кофейни",
  referenceSlug: "kofe-v-zernah-dlya-kofeyni",
  referenceUrl: "https://audiolad.ru/b/coffee/kofe-v-zernah-dlya-kofeyni",
  articlesDir: "src/lib/business/vertical-guides/articles",
  registryFile: "src/lib/business/vertical-guides/registry.ts",
  verticalsFile: "src/lib/business/vertical-guides/verticals.ts",
  expertsRegistry: "src/content/business/coffee-experts.registry.json",
  expertsPublicDir: "public",
  heroSrc: "/images/b/coffee/four-cups/06-all-cups.jpg",
  /**
   * og:image and JSON-LD image: a generated text card (own artwork, not a photo) per article,
   * written by og-card.mjs at apply time. Dates are markup-only (JSON-LD, OG meta, sitemap), never visible.
   */
  ogDir: "public/images/b/coffee/og",
  ogSrc: (slug) => `/images/b/coffee/og/${slug}.jpg`,
  ogSize: { width: 1200, height: 630 },
  /** The only outgoing link the owner allowed (rendered by the page as a button, not by the text). */
  maxUrl: "https://max-potok.ru/r/gqwvf",
  /** Absolute links allowed inside the text: cross-links to sergey-zoya.ru articles. */
  crossSiteHosts: ["sergey-zoya.ru"],
  /**
   * Default note for relatedQueries (not printed on the page). A pack may pass its own `wordstatNote`.
   * Topics and frequencies come only from Sergey's task for the pack (`task` + `articles[]`);
   * the coffee mode never picks topics from a Wordstat CSV by itself.
   */
  wordstatNote: "Яндекс Wordstat, частоты из задачи на пакет. Показы запроса, не число владельцев.",
  packMax: 5,
  // Per-draft budget (Sergey, 30.10.2026): one article (generate + optional repair) never costs more
  // than this. A call whose worst case would cross it is not made.
  maxRubPerDraft: 10,
  // A full article needs at least this many completion tokens; a smaller window is not worth a call.
  draftMinTokens: 6000,
  /**
   * Draft call = the sz pack 17 setup (task 354517de, 28.10.2026): model gpt-5.4-mini only, one call per
   * article, no repair call (--no-repair; Codex polishes), max_tokens 9000 (trimmed further by the
   * per-draft cap), temperature 0.4 (the shared buildRequest default, same request as sz), json_schema strict. gpt-oss-120b is not used for coffee.
   */
  draft: { model: "openai/gpt-5.4-mini", maxTokens: 9000, temperature: 0.4, repair: false },
  /** Every topic brief carries 3–6 verified facts, each with «Источник: …» in words (round 2 of the pilot). */
  facts: [3, 6],
  /** The prompt aims here; rules accept limits.totalWords. */
  targetWords: 1600,
  limits: {
    seoTitleMax: 70,
    description: [120, 170],
    /** Intro: straight to the practical topic, no story; the first paragraph carries the query. */
    intro: [1, 3],
    introWords: [40, 160],
    sectionParagraphs: [2, 4],
    tableRows: [3, 6],
    tableColumns: [3, 4],
    /** 7–8 questions (SEO audit 30.10.2026: FAQ covers the related queries). */
    faq: [7, 8],
    /** «Коротко» block under the intro: 3–5 short takeaways. */
    summary: [3, 5],
    summaryItemWords: [6, 30],
    /** In-text links to other guides of the section (intro, sections, table, expert lead/after). */
    textLinksMin: 3,
    faqAnswerWords: [15, 90],
    checklist: 5,
    totalWords: [1300, 2600],
    queryCount: [2, 9],
  },
};
