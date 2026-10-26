// Fields (model JSON) → content/articles/<slug>.md in the canonical order of pack 03 / angel-hranitel.
import { normalizeArticle } from "../../normalize.mjs";
import { SZ } from "./config.mjs";
import { expertCard as resolveCard } from "./experts.mjs";
import { stripInvisible } from "./rules.mjs";

const q = (value) => JSON.stringify(String(value));
const list = (value) => (Array.isArray(value) ? value : []);
const s = (value) => (typeof value === "string" ? value.trim() : "");
const capital = (text) => text.charAt(0).toLocaleUpperCase("ru") + text.slice(1);

/** Typography (shared writer rules) + sz-specific cleanups. Returns { fields, changes }. */
const stripTree = (value) => {
  if (typeof value === "string") return stripInvisible(value);
  if (Array.isArray(value)) return value.map(stripTree);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripTree(item)]));
  return value;
};

export function normalizeSzFields(raw) {
  const { article, changes } = normalizeArticle(raw ?? {}, {});
  const fields = stripTree(article);
  const counts = {};
  const bump = (name) => (counts[name] = (counts[name] ?? 0) + 1);
  const unbold = (text) => {
    const out = s(text).replace(/\*\*/g, "");
    if (out !== s(text)) bump("жирный внутри поля снят");
    return out;
  };
  for (const key of ["question", "finalQuestion"]) fields[key] = unbold(fields[key]).replace(/^[«"]|[»"]$/g, "");
  for (const key of ["story", "practiceIntro"]) fields[key] = list(fields[key]).map(unbold).filter(Boolean);
  for (const key of ["transition", "invitation", "storyEnding", "finalInvite", "psychologyIntro"]) fields[key] = unbold(fields[key]);
  fields.storyEnding = fields.storyEnding.replace(/^Чем закончилась история\.?\s*/u, "");
  for (const step of list(fields.steps?.items)) {
    const title = s(step.title).replace(/^(?:Шаг\s*)?\d+[.)]?\s*/u, "");
    if (title !== s(step.title)) bump("номер шага снят (сайт нумерует сам)");
    step.title = title;
  }
  if (fields.checklist) fields.checklist.items = list(fields.checklist.items).map((item) => s(item).replace(/^\d+[.)]\s*/, ""));
  const extra = Object.entries(counts).map(([name, count]) => `${name}: ${count}`);
  return { fields, changes: [...changes, ...extra] };
}

const paragraphs = (items) => list(items).map(s).filter(Boolean);
const cell = (text) => s(text).replace(/\|/g, "/").replace(/\n+/g, " ");

/** Inner quotes inside «…» become „…“ (Russian typography): «… „алфавит чувств“.» */
export const nestQuotes = (text) => String(text).replace(/«([^«»]*)»/g, "„$1“");

function expertCard(expert, written, site) {
  const known = expert.resolvedCard ?? resolveCard(expert.name, { siteCards: site?.expertCards, override: expert.card });
  if (!known.photo) throw new Error(`«${expert.name}»: нет портрета (public/media/experts) – добавьте портрет или card.photo в брифе`);
  return [
    `<section class="article-expert" aria-label="${expert.name}">`,
    `<div class="article-expert-head"><img class="article-expert-photo" src="/media/experts/${known.photo}" alt="${known.alt}" width="96" height="96" loading="lazy"><div><p class="article-expert-name">${expert.name}</p><p class="article-expert-role">${expert.role || known.role}</p><p class="article-expert-credit">${known.credit}</p></div></div>`,
    "",
    // Empty thesis stays visible as a placeholder; checkSzArticle rejects it.
    `### ${expert.name}: ${s(written?.thesis) || "главная мысль"}`,
    "",
    `Источник: ${expert.source}.`,
    "",
    `> «${nestQuotes(expert.quote)}»`,
    "",
    s(written?.bridge),
    "",
    "</section>",
  ].join("\n");
}

function section(title, items) {
  return [`## ${s(title)}`, ...paragraphs(items)].join("\n\n");
}

export function assembleSzArticle(brief, rawFields, site, { date }) {
  const { fields: f } = normalizeSzFields(structuredClone(rawFields));
  const p = brief.practice;
  const fm = [
    "---",
    `title: ${q(brief.title)}`,
    `seoTitle: ${q(s(f.seoTitle))}`,
    `description: ${q(s(f.description))}`,
    `publishedAt: ${q(date)}`,
    `updatedAt: ${q(date)}`,
    `author: ${q(SZ.author)}`,
    `faqHeading: ${q(s(f.faqHeading))}`,
    `ogImage: /media/og/${brief.slug}.jpg`,
    "reference: true",
    "draft: false",
    "listed: true",
    `topic: ${q(brief.topic)}`,
    "index: true",
    "angels: false",
    "overview: true",
    "related: false",
    "defaultCtas: false",
    "ctaInline:",
    `  buttonLabel: ${q(SZ.maxLabel)}`,
    "ctaFinal:",
    `  buttonLabel: ${q(SZ.maxLabel)}`,
    "practiceAudio:",
    `  title: ${q(p.title)}`,
    `  author: ${q(p.author)}`,
    `  duration: ${q(p.duration)}`,
    '  src: ""',
    `  pageUrl: https://audiolad.ru/practice/${p.path}`,
    `  embedUrl: https://audiolad.ru/embed/practice/${p.path}`,
    "faq:",
    ...list(f.faq).flatMap((item) => [`  - question: ${q(s(item?.question))}`, `    answer: ${q(s(item?.answer))}`]),
    "---",
  ].join("\n");

  const c = f.checklist ?? {};
  const checklist = [
    ":::checklist",
    `storageKey: ${brief.slug}-5-shagov`,
    "persist: local",
    `title: ${s(c.title)}`,
    `feedbackEmpty: ${s(c.feedbackEmpty)}`,
    `feedbackStart: ${s(c.feedbackStart)}`,
    `feedbackHalf: ${s(c.feedbackHalf)}`,
    `feedbackDone: ${s(c.feedbackDone)}`,
    "items:",
    ...list(c.items).flatMap((item, i) => [`- id: step-${i + 1}`, `  text: ${s(item)}`]),
    ":::",
  ].join("\n");

  const written = new Map(list(f.experts).map((expert) => [expert?.name, expert]));
  const cards = brief.experts.map((expert, i) => expertCard(expert, written.get(expert.name) ?? list(f.experts)[i], site));
  const t = f.tableSection ?? {};
  const columns = list(t.columns).map(cell);
  const table = [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...list(t.rows).map((row) => `| ${columns.map((_, i) => cell(list(row)[i] ?? "")).join(" | ")} |`),
  ].join("\n");
  const steps = f.steps ?? {};
  const specialistItems = paragraphs(f.specialist?.items).map((item) => `- ${item}`).join("\n");
  const disclaimer = [SZ.disclaimer, brief.disclaimerExtra].filter(Boolean).join(" ");
  const readmore = [
    '<section class="article-readmore" aria-labelledby="readmore-heading">',
    `<h2 id="readmore-heading">${SZ.readmoreHeading}</h2>`,
    "<ul>",
    ...brief.links.readmore.map((slug) => `<li><a href="/s/${slug}">${site.articles.get(slug)?.title ?? slug}</a></li>`),
    "</ul>",
    "</section>",
  ].join("\n");

  const body = [
    ...paragraphs(f.story),
    s(f.transition),
    s(f.invitation),
    `**${s(f.question)}**`,
    `${site.referenceGallery}\n:::cta early\n:::`,
    ":::overview\n:::",
    ...paragraphs(f.practiceIntro),
    `:::practiceAudio\n:::\n${checklist}`,
    `## ${capital(brief.query)}: что говорит психология`,
    s(f.psychologyIntro),
    ...cards,
    ...list(f.sectionsBefore).map((item) => section(item?.title, item?.paragraphs)),
    [`## ${s(t.title)}`, ...paragraphs(t.paragraphsBefore), table, ...paragraphs(t.paragraphsAfter)].join("\n\n"),
    [`## ${s(steps.title)}`, s(steps.intro), ...list(steps.items).flatMap((item) => [`### ${s(item?.title)}`, s(item?.text)])].filter(Boolean).join("\n\n"),
    ...list(f.sectionsAfter).map((item) => section(item?.title, item?.paragraphs)),
    [`## ${SZ.specialistHeading}`, s(f.specialist?.intro), specialistItems, brief.phones || SZ.phones, `<p class="article-disclaimer">${disclaimer}</p>`].filter(Boolean).join("\n\n"),
    ":::faq\n:::",
    `${SZ.storyEndingLead}${s(f.storyEnding)}`,
    readmore,
    ":::morelinks\n:::",
    s(f.finalInvite),
    `**${s(f.finalQuestion)}**`,
    SZ.allAngelsImage,
    ":::cta final\n:::",
  ].filter(Boolean).join("\n\n");
  return `${fm}\n\n${body}\n`;
}
