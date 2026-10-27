// Offline re-gate of the packs 14+15 control drafts. No model calls.
// Usage: node scripts/writer/sz-control-regate.mjs [/tmp/factory-fix]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { estimatePromptTokens } from "./lib/cost.mjs";
import { defaultExpertPool } from "./lib/sites/sz/experts.mjs";
import { ruleConfig } from "./lib/sites/sz/apply.mjs";
import { buildSzMessages } from "./lib/sites/sz/prompt.mjs";
import { szDraftTokenBudget } from "./lib/sites/sz/metrics.mjs";
import {
  briefForbiddenProblems,
  faqQuestionHints,
  packInstructionProblems,
  quotationsFromLibrary,
  reusedQuoteProblems,
  sharedFaqHintProblems,
} from "./lib/sites/sz/pack-audit.mjs";
import { postProcessDraftMarkdown, replaceGuaranteeStem } from "./lib/sites/sz/post.mjs";
import { checkSzArticle, checkSzPack, normalize } from "./lib/sites/sz/rules.mjs";

const root = process.argv[2] ?? "/tmp/factory-fix";
const briefsDir = join(root, "briefs");
const articlesDir = join(root, "run1/articles");
const gatePath = join(root, "run1/gate-results.json");
const libraryPath = join(root, "dispatch/quote-library.json");
const outDir = join("scripts/writer/fixtures/sz/control-1415-corrected");

const pool = defaultExpertPool();
const saved = JSON.parse(readFileSync(gatePath, "utf8"));
const library = JSON.parse(readFileSync(libraryPath, "utf8"));
const quotations = quotationsFromLibrary(library);
const briefFiles = readdirSync(briefsDir).filter((name) => name.endsWith(".json")).sort();
const packs = briefFiles.map((name) => JSON.parse(readFileSync(join(briefsDir, name), "utf8")));
const articles = packs.flatMap((pack) => pack.articles);

function faqQuestions(md) {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  return [...fm.matchAll(/^ {2}- question: (.+)$/gm)].map((match) => JSON.parse(match[1]));
}

function galleryOf(md) {
  return md.match(/^:::gallery\n[\s\S]*?\n:::/m)?.[0] ?? "";
}

function seedUnique(results) {
  const unique = { headings: new Map(), questions: new Map(), checklist: new Map(), quotations: new Map() };
  const kindOf = { цитата: "quotations", "пункт чек-листа": "checklist", заголовок: "headings", "вопрос FAQ": "questions" };
  for (const item of Object.values(results)) {
    for (const error of item.errors ?? []) {
      if (error.code !== "unique") continue;
      const match = error.message.match(/^(цитата|пункт чек-листа|заголовок|вопрос FAQ) «([\s\S]*)» уже есть в статье (\S+)$/u);
      if (!match) continue;
      unique[kindOf[match[1]]].set(normalize(match[2]), match[3]);
    }
  }
  return unique;
}

const unique = seedUnique(saved);
const drafts = new Map();
const published = new Set(articles.map((article) => article.slug));
for (const article of articles) {
  const md = readFileSync(join(articlesDir, `${article.slug}.md`), "utf8");
  drafts.set(article.slug, md);
  for (const slug of article.links?.contextual ?? []) published.add(slug);
  for (const slug of article.links?.readmore ?? []) published.add(slug);
  for (const match of md.matchAll(/\/s\/([a-z0-9-]+)/g)) published.add(match[1]);
}

const packFaqs = [...drafts.values()].flatMap((md) => faqQuestions(md));

function gateOne(article, md) {
  const date = md.match(/^publishedAt: "([^"]+)"/m)?.[1] ?? "2026-10-27";
  const cfg = ruleConfig(article, date, pool);
  const env = {
    published,
    unique,
    referenceGallery: galleryOf(md),
    portraitExists: () => true,
  };
  return checkSzArticle(md, cfg, env).filter((problem) => problem.severity === "error");
}

function tally(rows) {
  const codes = new Map();
  for (const row of rows) for (const error of row.errors) codes.set(error.code, (codes.get(error.code) ?? 0) + 1);
  return Object.fromEntries([...codes.entries()].sort((a, b) => b[1] - a[1]));
}

const before = [];
const after = [];
const notes = [];
for (const article of articles) {
  const raw = drafts.get(article.slug);
  const processed = postProcessDraftMarkdown(raw, article, packFaqs);
  before.push({ slug: article.slug, errors: gateOne(article, raw) });
  after.push({ slug: article.slug, errors: gateOne(article, processed.md), notes: processed.notes });
  notes.push({ slug: article.slug, notes: [...new Set(processed.notes)] });
}

const packItems = (rows, source) => articles.map((article, index) => ({
  cfg: ruleConfig(article, "2026-10-27", pool),
  md: source === "after"
    ? postProcessDraftMarkdown(drafts.get(article.slug), article, packFaqs).md
    : drafts.get(article.slug),
  errors: rows[index].errors,
}));
const packBefore = checkSzPack(packItems(before, "before"));
const packAfter = checkSzPack(packItems(after, "after"));

function packTally(problems) {
  const codes = new Map();
  for (const problem of problems) codes.set(problem.code, (codes.get(problem.code) ?? 0) + 1);
  return Object.fromEntries(codes);
}

const quoteHits = reusedQuoteProblems(articles, quotations);
const unusedLibrary = library.filter((entry) => !String(entry?.usedIn ?? "").trim()).length;
const briefAudit = {
  instructionProblems: packInstructionProblems(articles),
  sharedFaq: sharedFaqHintProblems(articles),
  forbidden: articles.flatMap((article) => briefForbiddenProblems(article)),
  reusedQuotes: quoteHits,
  librarySize: library.length,
  unusedLibrary,
  hintCount: articles.map((article) => ({ slug: article.slug, hints: faqQuestionHints(article).map((hint) => hint.text) })),
};

function sharedQuestionSet(list) {
  const seen = new Map();
  for (const article of list) {
    for (const hint of faqQuestionHints(article)) {
      if (hint.kind !== "question") continue;
      const key = normalize(hint.text);
      const owners = seen.get(key) ?? new Set();
      owners.add(article.slug);
      seen.set(key, owners);
    }
  }
  const shared = new Set();
  for (const [key, owners] of seen) if (owners.size > 1) shared.add(key);
  return shared;
}

function rewriteSharedQuestion(question, query) {
  const folded = question.toLocaleLowerCase("ru");
  if (/гарантир/u.test(folded) || (folded.includes("доход") && /ли\b/u.test(folded))) return `Обещает ли практика доход в теме ${query}?`;
  if (folded.includes("своими словами")) return `Можно ли формулировать примеры своими словами в теме ${query}?`;
  if (folded.includes("психолог")) return `Когда стоит обсудить с психологом тему ${query}?`;
  if (normalize(question).includes(normalize(query))) return question;
  return question.replace(/\?\s*$/u, ` по теме ${query}?`);
}

function correctArticle(article, shared) {
  const next = structuredClone(article);
  next.extraInstructions = (next.extraInstructions ?? []).map((line) => String(line).replace(/«([^»]+\?)»/gu, (full, question) => {
    if (!shared.has(normalize(question))) return full;
    return `«${rewriteSharedQuestion(question, next.query)}»`;
  }));
  next.faqHints = (next.faqHints ?? []).map((hint) => {
    const match = String(hint?.match ?? "");
    const folded = match.toLocaleLowerCase("ru");
    if (folded === "доход" || folded.startsWith("доход")) return { ...hint, match: `доход в теме ${next.query}` };
    if (folded.includes("своими словами")) return { ...hint, match: `своими словами в теме ${next.query}` };
    return hint;
  });
  const phrases = next.forbiddenPhrases ?? [];
  const stem = (text) => replaceGuaranteeStem(text, { phrases });
  for (const field of ["storyHint", "tableHint", "intent", "audience"]) {
    if (typeof next[field] === "string") next[field] = stem(next[field]);
  }
  for (const field of ["facts", "commonMistakes", "sectionsHint", "extraInstructions"]) {
    if (Array.isArray(next[field])) next[field] = next[field].map((item) => (typeof item === "string" ? stem(item) : item));
  }
  return next;
}

const shared = sharedQuestionSet(articles);
mkdirSync(outDir, { recursive: true });
const correctedArticles = [];
for (const pack of packs) {
  const copy = structuredClone(pack);
  copy.articles = copy.articles.map((article) => correctArticle(article, shared));
  correctedArticles.push(...copy.articles);
  const file = join(outDir, `${copy.articles[0].slug}.json`);
  writeFileSync(file, `${JSON.stringify(copy, null, 2)}\n`);
}
const correctedAudit = {
  instructionProblems: packInstructionProblems(correctedArticles),
  sharedFaq: sharedFaqHintProblems(correctedArticles),
  forbidden: correctedArticles.flatMap((article) => briefForbiddenProblems(article)),
  reusedQuotes: reusedQuoteProblems(correctedArticles, quotations),
};

const site = { articles: new Map() };
const promptTokens = articles.map((article) => estimatePromptTokens(buildSzMessages(article, site), "openai/gpt-5.4-mini"));
const budgets = promptTokens.map((tokens) => szDraftTokenBudget({ model: "openai/gpt-5.4-mini", promptTokens: tokens, requestedTokens: 9000 }));

const report = {
  before: tally(before),
  after: tally(after),
  packBefore: packTally(packBefore),
  packAfter: packTally(packAfter),
  perArticle: after.map((row, index) => ({
    slug: row.slug,
    before: before[index].errors.length,
    after: row.errors.length,
    gone: [...new Set(before[index].errors.map((error) => error.code))].filter((code) => !row.errors.some((error) => error.code === code)),
    left: [...new Set(row.errors.map((error) => error.code))],
    newCodes: [...new Set(row.errors.map((error) => error.code))].filter((code) => !before[index].errors.some((error) => error.code === code)),
  })),
  notes,
  briefAudit: {
    instructionProblems: briefAudit.instructionProblems.length,
    sharedFaq: briefAudit.sharedFaq.length,
    forbidden: briefAudit.forbidden.length,
    reusedQuotes: briefAudit.reusedQuotes.length,
    librarySize: briefAudit.librarySize,
    unusedLibrary: briefAudit.unusedLibrary,
    samples: {
      sharedFaq: briefAudit.sharedFaq.slice(0, 8),
      forbidden: briefAudit.forbidden.slice(0, 8),
      reused: briefAudit.reusedQuotes.slice(0, 4),
    },
  },
  correctedAudit: {
    instructionProblems: correctedAudit.instructionProblems.length,
    sharedFaq: correctedAudit.sharedFaq.length,
    forbidden: correctedAudit.forbidden.length,
    reusedQuotes: correctedAudit.reusedQuotes.length,
    leftover: correctedAudit.instructionProblems.slice(0, 12),
  },
  promptTokens: { min: Math.min(...promptTokens), max: Math.max(...promptTokens), values: Object.fromEntries(articles.map((article, index) => [article.slug, promptTokens[index]])) },
  budgets: budgets.map((budget, index) => ({
    slug: articles[index].slug,
    maxTokens: budget.maxTokens,
    worst: Number(budget.worst.toFixed(3)),
    inputRub: Number(budget.inputRub.toFixed(3)),
    wordsAtBudget: budget.wordsAtBudget,
  })),
};
writeFileSync(join(root, "regate.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  before: report.before,
  after: report.after,
  packBefore: report.packBefore,
  packAfter: report.packAfter,
  briefAudit: report.briefAudit,
  correctedAudit: report.correctedAudit,
  promptTokens: { min: report.promptTokens.min, max: report.promptTokens.max },
  budgetWorst: report.budgets.map((item) => [item.slug, item.worst, item.maxTokens, item.wordsAtBudget]),
  perArticle: report.perArticle,
}, null, 2));
