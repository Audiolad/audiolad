// Pack brief for `--site coffee`: up to 5 coffee guides. A pack must declare
// "site": "coffee" and "template": "audiolad-coffee-guide-v1"; anything else (an sz pack, a
// single-article brief) is refused before any Cloud.ru call.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { COFFEE } from "./config.mjs";

export class CoffeeBriefError extends Error {
  constructor(message) {
    super(message);
    this.code = 1;
  }
}

const LATIN = /[A-Za-z]/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const strings = (value) => (Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : []);

/** Throws unless the raw JSON is a coffee pack (used by run.mjs before choosing a pipeline). */
export function assertCoffeePack(raw) {
  if (!raw || typeof raw !== "object") throw new CoffeeBriefError("бриф coffee: ожидается JSON-объект пакета");
  if (raw.site !== COFFEE.site || raw.template !== COFFEE.templateId) {
    throw new CoffeeBriefError(`бриф не для шаблона coffee: нужны "site": "${COFFEE.site}" и "template": "${COFFEE.templateId}", получено site=${JSON.stringify(raw.site)}, template=${JSON.stringify(raw.template)}`);
  }
}

/** Expert registry of the coffee section (src/content/business/coffee-experts.registry.json). */
export function loadCoffeeExperts(repoDir) {
  const file = join(repoDir, COFFEE.expertsRegistry);
  const json = JSON.parse(readFileSync(file, "utf8"));
  return new Map(json.experts.map((expert) => [expert.id, expert]));
}

/** Problems with one expert slot: registry entry, licensed portrait on disk, Russian-only texts. */
export function expertSlotProblems(slot, experts, { repoDir } = {}) {
  const problems = [];
  const expert = experts.get(slot.id);
  if (!expert) return [`эксперт ${slot.id}: нет в реестре ${COFFEE.expertsRegistry}`];
  const photo = expert.photo ?? {};
  if (!photo.file || !photo.license || !photo.credit || !photo.author) problems.push(`эксперт ${slot.id}: нет настоящего фото со свободной лицензией и подписью автора – экспертный блок недопустим`);
  else if (repoDir && !existsSync(join(repoDir, COFFEE.expertsPublicDir, photo.file))) problems.push(`эксперт ${slot.id}: файла портрета ${photo.file} нет в public/`);
  if (LATIN.test(`${expert.name} ${expert.role} ${photo.credit ?? ""}`)) problems.push(`эксперт ${slot.id}: латиница в имени, роли или подписи фото`);
  const quote = expert.quotes?.[slot.quoteIndex];
  if (!quote) return [...problems, `эксперт ${slot.id}: нет цитаты №${slot.quoteIndex}`];
  if (!quote.sourceLabel || LATIN.test(quote.sourceLabel)) problems.push(`эксперт ${slot.id}: у цитаты №${slot.quoteIndex} нет русской подписи источника (sourceLabel) – цитата не готова для страницы`);
  const russian = quote.language === "ru";
  if (!russian && !slot.translation) problems.push(`эксперт ${slot.id}: иностранная цитата – нужен перевод в брифе (experts[].translation), Райтер его не пишет`);
  if (slot.translation && LATIN.test(slot.translation)) problems.push(`эксперт ${slot.id}: латиница в переводе`);
  if (russian && slot.translation) problems.push(`эксперт ${slot.id}: русская цитата не переводится – уберите translation`);
  return problems;
}

export function normalizeCoffeePack(raw, { experts, repoDir } = {}) {
  assertCoffeePack(raw);
  const problems = [];
  const articles = Array.isArray(raw.articles) ? raw.articles : [];
  if (!articles.length || articles.length > COFFEE.packMax) problems.push(`в пакете должно быть 1–${COFFEE.packMax} статей, получено ${articles.length}`);
  if (!raw.pack || !SLUG.test(String(raw.pack))) problems.push(`pack: нужен латинский id пакета (например coffee-01), получено ${JSON.stringify(raw.pack)}`);
  // Topics come only from Sergey's task (5 per set): the pack names the task, articles[] lists the topics.
  if (typeof raw.task !== "string" || !raw.task.trim()) problems.push("task: укажите задачу Сергея, из которой взяты темы пакета (темы задаёт Сергей, Райтер их не выбирает)");
  for (const [index, item] of articles.entries()) if (item && "storyHint" in item) problems.push(`${item.slug ?? `#${index + 1}`}: storyHint больше не используется – статьи о кофейнях без истории`);
  const seen = new Set();
  const out = articles.map((item, index) => {
    const at = item?.slug ?? `#${index + 1}`;
    const brief = {
      slug: String(item?.slug ?? ""),
      title: String(item?.title ?? "").trim(),
      primaryQuery: String(item?.primaryQuery ?? "").trim(),
      relatedQueries: Array.isArray(item?.relatedQueries) ? item.relatedQueries.map((q) => ({ phrase: String(q.phrase), frequency: Number.isInteger(q.frequency) ? q.frequency : null })) : [],
      intent: item?.intent ? String(item.intent) : "",
      wordstatNote: raw.wordstatNote ? String(raw.wordstatNote) : "",
      facts: strings(item?.facts),
      sectionsHint: strings(item?.sectionsHint),
      tableHint: item?.tableHint ? String(item.tableHint) : "",
      forbiddenPhrases: strings(item?.forbiddenPhrases),
      links: strings(item?.links),
      readMore: Array.isArray(item?.readMore) ? item.readMore.map((link) => ({ href: String(link.href), label: String(link.label) })) : [],
      experts: Array.isArray(item?.experts) ? item.experts.map((slot) => ({ id: String(slot.id), quoteIndex: Number(slot.quoteIndex ?? 0), ...(slot.translation ? { translation: String(slot.translation) } : {}) })) : [],
    };
    if (!SLUG.test(brief.slug)) problems.push(`${at}: slug только латиница, цифры и дефисы`);
    if (seen.has(brief.slug)) problems.push(`${at}: slug повторяется в пакете`);
    seen.add(brief.slug);
    if (brief.slug === COFFEE.referenceSlug) problems.push(`${at}: это эталонная статья, её не переписывают`);
    if (!brief.title || LATIN.test(brief.title)) problems.push(`${at}: title обязателен и без латиницы`);
    if (!brief.primaryQuery || LATIN.test(brief.primaryQuery)) problems.push(`${at}: primaryQuery обязателен и без латиницы`);
    for (const href of brief.links) if (!isAllowedTextHref(href)) problems.push(`${at}: ссылка ${href} – разрешены только адреса audiolad.ru («/…»), статьи ${COFFEE.crossSiteHosts.join(", ")} и ${COFFEE.maxUrl}`);
    // Facts are required: 3–6 verified facts give the model legal numbers and norms (round 2 of the pilot).
    if (brief.facts.length < COFFEE.facts[0] || brief.facts.length > COFFEE.facts[1]) problems.push(`${at}: facts – нужно ${COFFEE.facts[0]}–${COFFEE.facts[1]} проверенных факта с «Источник: …» словами (цифры, нормы, размеры), сейчас ${brief.facts.length}`);
    for (const fact of brief.facts) if (!/[а-яё]{4,}/i.test(fact.split(/Источник:/i)[1] ?? "")) problems.push(`${at}: факт «${fact.slice(0, 60)}» – нужен реальный источник словами: «… Источник: название, дата»`);
    if (!brief.readMore.length) problems.push(`${at}: readMore – нужна хотя бы одна внутренняя ссылка`);
    for (const link of brief.readMore) if (!isInternalHref(link.href) || LATIN.test(link.label)) problems.push(`${at}: readMore ${link.href} – только внутренние адреса и подписи без латиницы`);
    if (brief.experts.length !== 2) problems.push(`${at}: нужны ровно 2 эксперта`);
    else {
      for (const slot of brief.experts) problems.push(...expertSlotProblems(slot, experts, { repoDir }).map((p) => `${at}: ${p}`));
      const [a, b] = brief.experts.map((slot) => experts.get(slot.id));
      if (a && b) {
        if (a.gender === b.gender) problems.push(`${at}: эксперты – мужчина и женщина`);
        if ((a.origin === "ru") === (b.origin === "ru")) problems.push(`${at}: эксперты – один русскоязычный и один иностранный`);
      }
    }
    brief.warnings = brief.experts.length === 2 ? quoteFitWarnings(brief, experts) : [];
    return brief;
  });
  // Experts rotate (Sergey, 2026-10-30): inside a pack every expert appears once.
  const expertIn = new Map();
  for (const brief of out) {
    for (const slot of brief.experts) {
      const first = expertIn.get(slot.id);
      if (first && first !== brief.slug) problems.push(`${brief.slug}: эксперт ${slot.id} уже есть в статье ${first} – в пакете каждый эксперт один раз`);
      else if (first === brief.slug) problems.push(`${brief.slug}: эксперт ${slot.id} стоит в двух слотах`);
      else expertIn.set(slot.id, brief.slug);
    }
  }
  if (problems.length) throw new CoffeeBriefError(`бриф coffee не прошёл проверку:\n- ${problems.join("\n- ")}`);
  return { site: COFFEE.site, template: COFFEE.templateId, pack: String(raw.pack), task: String(raw.task).trim(), maxRub: raw.maxRub, articles: out };
}

// Topic words that every coffee brief shares and that therefore say nothing about fit.
const FIT_STOP = /^(кофей|кофе|котор|котор|этого|чтобы|когда|можно|очень|также|более|какой|какие|гость|гостя|гостей|владе)/;
const fitStems = (text) => new Set((String(text).toLowerCase().replace(/ё/g, "е").match(/[а-я]{5,}/g) ?? []).map((w) => w.slice(0, 5)).filter((s) => !FIT_STOP.test(s)));
/** How many topic stems (title, query, intent, section ideas) a quote shares, by its Russian text and context. */
export function quoteFitScore(brief, quote, translation) {
  const topic = fitStems([brief.title, brief.primaryQuery, brief.intent, ...(brief.sectionsHint ?? []), brief.tableHint].join(" "));
  const own = fitStems([translation ?? (quote.language === "ru" ? quote.text : ""), quote.context].join(" "));
  return [...own].filter((stem) => topic.has(stem)).length;
}
/**
 * Prefer the registry quote that fits the topic best (never an invented one): a warning when another quote
 * of the same expert shares more topic words, or when the chosen quote shares none.
 */
export function quoteFitWarnings(brief, experts) {
  const out = [];
  for (const slot of brief.experts) {
    const expert = experts.get(slot.id);
    const quote = expert?.quotes?.[slot.quoteIndex];
    if (!quote) continue;
    const chosen = quoteFitScore(brief, quote, slot.translation);
    let best = { index: slot.quoteIndex, score: chosen };
    expert.quotes.forEach((other, index) => {
      // Foreign quotes without a ready translation are judged by their context only.
      const score = quoteFitScore(brief, other, index === slot.quoteIndex ? slot.translation : undefined);
      if (score > best.score) best = { index, score };
    });
    if (best.index !== slot.quoteIndex) out.push(`${brief.slug}: у эксперта ${slot.id} цитата №${best.index} ближе к теме (${best.score} общих слов против ${chosen}) – возьмите её, если она подходит по смыслу`);
    else if (chosen === 0) out.push(`${brief.slug}: цитата ${slot.id} №${slot.quoteIndex} не пересекается с темой – возьмите цитату ближе к теме или другого эксперта из реестра; если оставляете, lead и after честно связывают её с темой`);
  }
  return out;
}

export function loadCoffeePack(path, options) {
  return normalizeCoffeePack(JSON.parse(readFileSync(path, "utf8")), options);
}

const SITE_ORIGIN = "https://audiolad.ru";
// Backslashes, control characters, whitespace and percent-encoded slashes/backslashes are never part
// of a safe href: browsers treat «/\host» as «//host» and leave audiolad.ru.
const UNSAFE_HREF = /[\\\s\u0000-\u001f\u007f]|%(?:2f|5c|0[0-9a-f]|1[0-9a-f])/i;

/** A path on audiolad.ru: starts with one «/», and still resolves to https://audiolad.ru. */
export function isInternalHref(href) {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//") || UNSAFE_HREF.test(href)) return false;
  try {
    const url = new URL(href, SITE_ORIGIN);
    return url.origin === SITE_ORIGIN && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isAllowedTextHref(href) {
  if (typeof href !== "string" || UNSAFE_HREF.test(href)) return false;
  if (isInternalHref(href) || href === COFFEE.maxUrl) return true;
  try {
    const url = new URL(href);
    return url.protocol === "https:" && COFFEE.crossSiteHosts.includes(url.hostname) && !url.port && !url.username && !url.password && url.href.startsWith(`https://${url.hostname}/`) && href.startsWith(`https://${url.hostname}/`);
  } catch {
    return false;
  }
}
