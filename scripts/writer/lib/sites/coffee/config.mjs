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
  limits: {
    seoTitleMax: 70,
    description: [120, 170],
    /** Intro: straight to the practical topic, no story; the first paragraph carries the query. */
    intro: [1, 3],
    introWords: [40, 160],
    sectionParagraphs: [2, 4],
    tableRows: [3, 6],
    tableColumns: [3, 4],
    faq: [5, 7],
    faqAnswerWords: [15, 90],
    checklist: 5,
    totalWords: [1300, 2600],
    queryCount: [2, 9],
  },
};
