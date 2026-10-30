// Fields JSON from the model + pack brief → a VerticalGuideArticle data module
// (src/lib/business/vertical-guides/articles/<slug>.ts), the same shape as the reference
// article. The page component renders it; the writer never writes components.
import { COFFEE } from "./config.mjs";

const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

/** Typography the template always wants, applied before the checks. Returns changed text. */
export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0|\u202f/g, " ")
    .replace(new RegExp(EM_DASH, "g"), EN_DASH)
    .replace(/ - /g, ` ${EN_DASH} `)
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** "Текст [анкор](/b/x) дальше" → ["Текст ", {href, label}, " дальше"]. */
export function parseInline(text) {
  const parts = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let match; (match = re.exec(text)); ) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ href: match[2], label: match[1] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [""];
}

const paragraph = (text) => parseInline(normalizeText(text));
const plain = (text) => normalizeText(text).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
const ids = ["part-1a", "part-1b", "part-2a", "part-2b", "part-2c"];

function sections(list, offset) {
  return (list ?? []).map((item, i) => {
    const out = {
      id: ids[offset + i] ?? `part-${offset + i}`,
      heading: plain(item.heading),
      paragraphs: (item.paragraphs ?? []).map(paragraph),
    };
    // Optional H3 subsections (SEO audit 30.10.2026): only when the model wrote them.
    const subsections = (item.subsections ?? [])
      .map((sub) => ({ heading: plain(sub.heading), paragraphs: (sub.paragraphs ?? []).map(paragraph) }))
      .filter((sub) => sub.heading && sub.paragraphs.length);
    if (subsections.length) out.subsections = subsections;
    return out;
  });
}

/** Today in Moscow as YYYY-MM-DD (the owner's zone). */
export function moscowDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function slot(brief, index, fields) {
  const expert = brief.experts[index];
  const out = {
    expertId: expert.id,
    quoteIndex: expert.quoteIndex,
    heading: plain(fields?.heading),
    lead: [paragraph(fields?.lead)],
  };
  if (expert.translation) out.translation = normalizeText(expert.translation);
  out.after = [paragraph(fields?.after)];
  return out;
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * @param options.today YYYY-MM-DD for publishedAt/updatedAt when the brief has none (default: today in Moscow).
 * Dates go only to markup (JSON-LD, article:published_time / modified_time, sitemap lastmod); the page never prints them.
 */
export function assembleCoffeeArticle(brief, fields, { today = moscowDate() } = {}) {
  const publishedAt = brief.publishedAt || today;
  return {
    verticalId: COFFEE.verticalId,
    slug: brief.slug,
    title: brief.title,
    seoTitle: plain(fields.seoTitle),
    description: plain(fields.description),
    publishedAt,
    updatedAt: brief.updatedAt || publishedAt,
    primaryQuery: brief.primaryQuery,
    relatedQueries: brief.relatedQueries.map((query) => ({ phrase: query.phrase, frequency: query.frequency, note: brief.wordstatNote || COFFEE.wordstatNote })),
    hero: { src: COFFEE.heroSrc, alt: plain(fields.heroAlt), caption: "Четыре чашки – четыре характера кофейни." },
    // Generated text card (own artwork), written by og-card.mjs in applyCoffeePack.
    ogImage: { src: COFFEE.ogSrc(brief.slug), alt: `${brief.title} – текстовая обложка ${COFFEE.byline}`, ...COFFEE.ogSize },
    // No opening story (owner rule 2026-10-30): the intro goes straight to the topic, query first.
    // Intro paragraphs may carry [анкор](адрес) links to sibling guides.
    intro: (fields.intro ?? []).map(paragraph),
    summary: (fields.summary ?? []).map(plain).filter(Boolean),
    question: plain(fields.question),
    partOne: sections(fields.partOne, 0),
    table: {
      id: "table",
      heading: plain(fields.table?.heading),
      intro: [paragraph(fields.table?.intro)],
      caption: plain(fields.table?.caption),
      columns: (fields.table?.columns ?? []).map(plain),
      rows: (fields.table?.rows ?? []).map((row) => row.map(plain)),
      after: fields.table?.after ? [paragraph(fields.table.after)] : [],
    },
    expertOne: slot(brief, 0, fields.expertOne),
    partTwo: sections(fields.partTwo, 2),
    expertTwo: slot(brief, 1, fields.expertTwo),
    steps: {
      id: "steps",
      heading: plain(fields.steps?.heading),
      intro: plain(fields.steps?.intro),
      items: (fields.steps?.items ?? []).map((item) => ({ title: plain(item.title), text: plain(item.text) })),
    },
    checklist: {
      title: plain(fields.checklist?.title),
      storageKey: `audiolad.b.coffee.${brief.slug}.checklist.v1`,
      items: (fields.checklist?.items ?? []).map((text, i) => ({ id: `c${i + 1}`, text: capitalize(plain(text)) })),
      note: plain(fields.checklist?.note),
      doneNote: plain(fields.checklist?.doneNote),
    },
    faq: (fields.faq ?? []).map((item) => ({ question: plain(item.question), answer: plain(item.answer) })),
    finalQuestion: plain(fields.finalQuestion),
    readMore: brief.readMore,
  };
}

export const exportName = (slug) => slug.toUpperCase().replace(/-/g, "_");

/** TypeScript module text for the article (deterministic, JSON-quoted strings). */
export function toTsModule(article, { packId, model } = {}) {
  const body = JSON.stringify(article, null, 2).replace(/^( *)"([A-Za-z_][A-Za-z0-9_]*)":/gm, "$1$2:");
  return [
    'import type { VerticalGuideArticle } from "../types";',
    "",
    "/**",
    ` * Coffee guide written by Райтер (--site coffee, template ${COFFEE.templateId}${packId ? `, pack ${packId}` : ""}${model ? `, ${model}` : ""}).`,
    ` * Reference: ${COFFEE.referenceUrl}. Rules: scripts/writer/lib/sites/coffee/knowledge/TEMPLATE_RU.md.`,
    " * Expert quotes and portraits come from coffee-experts.registry.json; the page renders them.",
    " */",
    `export const ${exportName(article.slug)}: VerticalGuideArticle = ${body};`,
    "",
  ].join("\n");
}
