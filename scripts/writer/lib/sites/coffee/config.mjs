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
  wordstatNote: "Яндекс Wordstat, 19.09–19.10.2026. Строка wordstat-candidates.csv. Показы запроса, не число владельцев.",
  packMax: 5,
  limits: {
    seoTitleMax: 70,
    description: [120, 170],
    story: [3, 6],
    storyWords: [120, 260],
    dialogueLines: 2,
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
