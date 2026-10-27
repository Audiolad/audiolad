// Pack brief for sergey-zoya.ru: 1–5 articles that go into ONE draft PR.
// Everything factual (practice description, expert quotes with context, links, facts) comes from
// the brief; the model only writes prose around it. See scripts/writer/README.md («Режим sz»).
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { parseMaxRub } from "../../cost.mjs";
import { readJson } from "../../util.mjs";
import { SZ } from "./config.mjs";
import { CONFLICTING_EXPERTS, defaultExpertPool, missingMix, rotationProblems } from "./experts.mjs";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRACTICE_PATH = /^[a-z0-9-]+\/[a-z0-9-]+$/;
export const PACK_MAX = 5;

export const quoteText = (text) => String(text).replace(/[«»"“”„]/g, "").replace(/[—–-]/g, "–").replace(/\s+/g, " ").trim();

function need(condition, message, errors) {
  if (!condition) errors.push(message);
}
const isText = (value, min = 1) => typeof value === "string" && value.trim().length >= min;
const list = (value) => (Array.isArray(value) ? value : []);

export function loadPack(path, { pool } = {}) {
  const raw = readJson(path);
  return normalizePack(raw, { baseDir: dirname(path), pool });
}

/** Validates and normalizes the pack; throws one error listing every problem. */
export function normalizePack(raw, { baseDir = process.cwd(), pool = defaultExpertPool() } = {}) {
  const errors = [];
  need(raw && typeof raw === "object", "пакет должен быть JSON-объектом", errors);
  const pack = String(raw?.pack ?? "").trim();
  need(PACK_ID.test(pack), `pack: латиница/цифры/дефис, получено «${pack}»`, errors);
  const articles = list(raw?.articles);
  need(articles.length >= 1 && articles.length <= PACK_MAX, `articles: от 1 до ${PACK_MAX} статей, получено ${articles.length}`, errors);
  // Pack limit tightens --max-rub; it must be a JSON number (not «3 ₽», not "3"), checked before any spend.
  let maxRub = null;
  if (raw?.maxRub !== undefined && raw?.maxRub !== null) {
    if (typeof raw.maxRub !== "number") errors.push(`maxRub: нужно число рублей без кавычек и «₽» (например 3), получено «${raw.maxRub}»`);
    else {
      try {
        maxRub = parseMaxRub(raw.maxRub, "maxRub");
      } catch (error) {
        errors.push(error.message);
      }
    }
  }
  if (raw?.publishedAt !== undefined) need(/^\d{4}-\d{2}-\d{2}$/.test(raw.publishedAt), "publishedAt: YYYY-MM-DD", errors);
  const out = articles.map((article, index) => normalizeArticleBrief(article, index, errors, baseDir, pool));
  const slugs = out.map((item) => item.slug);
  for (const slug of new Set(slugs)) need(slugs.filter((s) => s === slug).length === 1, `slug «${slug}» повторяется в пакете`, errors);
  const queries = out.map((item) => item.query);
  for (const query of new Set(queries)) need(queries.filter((q) => q === query).length === 1, `ключ «${query}» повторяется в пакете`, errors);
  errors.push(...rotationProblems(out));
  const quotes = out.flatMap((item) => item.experts.map((expert) => `${item.slug}:${quoteText(expert.quote)}`));
  const bare = quotes.map((q) => q.slice(q.indexOf(":") + 1));
  for (const [i, q] of bare.entries()) need(bare.indexOf(q) === i, `цитата повторяется в пакете: «${q.slice(0, 50)}…»`, errors);
  if (errors.length) throw new Error(`Пакет-бриф не прошёл проверку:\n- ${errors.join("\n- ")}`);
  return { pack, publishedAt: raw.publishedAt ?? null, maxRub, articles: out };
}

function normalizeArticleBrief(raw, index, errors, baseDir, pool) {
  const at = `articles[${index}]`;
  const slug = String(raw?.slug ?? "").trim();
  need(SLUG.test(slug), `${at}.slug: латиница, цифры и дефис`, errors);
  const query = String(raw?.query ?? "").trim().toLocaleLowerCase("ru");
  need(isText(query, 3), `${at}.query: основной запрос`, errors);
  const title = String(raw?.title ?? "").trim();
  need(isText(title, 10), `${at}.title: H1`, errors);
  const topic = String(raw?.topic ?? "napravleniya-ezoteriki");
  need(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic), `${at}.topic: slug темы латиницей (например ${SZ.topics.join(", ")}; новая тема – тоже можно, это просто метка)`, errors);
  const practice = raw?.practice ?? {};
  need(isText(practice.title), `${at}.practice.title`, errors);
  need(isText(practice.duration) && /^\d+ мин$/.test(practice.duration), `${at}.practice.duration: «7 мин»`, errors);
  need(PRACTICE_PATH.test(practice.path ?? ""), `${at}.practice.path: «sergey-and-zoya/<slug>» (pageUrl/embedUrl на audiolad.ru)`, errors);
  need(isText(practice.materials, 40), `${at}.practice.materials: описание практики со страницы АудиоЛад (из него берутся свойства практики)`, errors);
  const experts = list(raw?.experts).map((expert, i) => {
    const where = `${at}.experts[${i}]`;
    const known = pool.get(expert?.name);
    need(Boolean(known), `${where}: «${expert?.name}» нет в пуле EXPERTS_RU.md (--experts / WRITER_SZ_EXPERTS)`, errors);
    const card = expert?.card ? { ...expert.card } : null;
    if (card !== null) need(typeof card === "object" && ["photo", "alt", "credit", "role", "photoFile"].every((key) => card[key] === undefined || isText(card[key], 2)), `${where}.card: {photo, alt, credit, role, photoFile} – строки`, errors);
    if (card?.photo) need(/^[a-z0-9-]+\.(?:webp|jpg|png)$/.test(card.photo), `${where}.card.photo: имя файла в public/media/experts (латиница, .webp)`, errors);
    if (card?.photoFile) {
      card.photoFile = isAbsolute(card.photoFile) ? card.photoFile : resolve(baseDir, card.photoFile);
      need(existsSync(card.photoFile), `${where}.card.photoFile: нет файла ${card.photoFile}`, errors);
      need(Boolean(card.photo), `${where}.card.photoFile требует card.photo (имя файла на сайте)`, errors);
    }
    need(isText(expert?.quote, 10), `${where}.quote: дословная цитата из источника`, errors);
    need(isText(expert?.source, 5), `${where}.source: источник текстом («книга «…», глава …»), без ссылки`, errors);
    need(!/https?:|www\.|\.ru\b|\.com\b/i.test(expert?.source ?? ""), `${where}.source: источник называется текстом, без адреса сайта`, errors);
    need(isText(expert?.context, 10), `${where}.context: о чём глава / к кому относится цитата (против приписывания выводов)`, errors);
    need(isText(expert?.doesNotSay, 3), `${where}.doesNotSay: чего эксперт НЕ говорит по теме статьи`, errors);
    let sourceText = null;
    if (expert?.sourceFile) {
      const file = isAbsolute(expert.sourceFile) ? expert.sourceFile : resolve(baseDir, expert.sourceFile);
      if (existsSync(file)) sourceText = readFileSync(file, "utf8");
      else errors.push(`${where}.sourceFile: файл не найден ${expert.sourceFile}`);
    } else if (isText(expert?.sourceText, 10)) {
      sourceText = expert.sourceText;
    }
    need(sourceText !== null, `${where}: нужен sourceFile или sourceText – текст источника для сверки дословности`, errors);
    // Strip the outer «…» only when the quote itself starts with «. A quote that merely ends with
    // an inner pair (… не сформирован «алфавит чувств».) keeps it (review of sergey-zoya-site #77).
    const raw = String(expert?.quote ?? "").trim();
    const inner = raw.slice(1).replace(/»\.?$/, "");
    const wrapped = /^«[\s\S]*»\.?$/.test(raw) && inner.split("«").length === inner.split("»").length;
    const quote = wrapped ? inner : raw;
    if (sourceText !== null && quote) {
      need(quoteText(sourceText).includes(quoteText(quote)), `${where}.quote: нет дословно в источнике`, errors);
    }
    return {
      name: expert?.name,
      role: String(expert?.role ?? expert?.card?.role ?? "").trim(),
      card,
      caution: known?.caution ?? "",
      gender: known?.gender ?? null,
      group: known?.group ?? null,
      quote,
      sourceText,
      source: String(expert?.source ?? "").trim().replace(/\.$/, ""),
      context: String(expert?.context ?? "").trim(),
      doesNotSay: String(expert?.doesNotSay ?? "").trim(),
      forbiddenInBridge: list(expert?.forbiddenInBridge).map(String),
    };
  });
  need(experts.length === 2, `${at}.experts: ровно 2 эксперта`, errors);
  const names = experts.map((expert) => expert.name);
  for (const [a, b] of CONFLICTING_EXPERTS) need(!(names.includes(a) && names.includes(b)), `${at}.experts: «${a}» и «${b}» спорят друг с другом – не ставить в одну статью (EXPERTS_RU.md, «Осторожно»)`, errors);
  const mix = missingMix(names, pool);
  need(mix.length === 0, `${at}.experts: в статье нужен хотя бы один ${mix.join(", ")} (Ж, М, РУ, ЗАР)`, errors);
  const [linkMin, linkMax] = SZ.limits.contextualLinks;
  const contextual = list(raw?.links?.contextual).map((item) => (typeof item === "string" ? item : String(item?.slug ?? ""))).map((item) => item.trim()).filter(Boolean).slice(0, linkMax);
  const readmore = list(raw?.links?.readmore).map(String);
  need(contextual.length >= linkMin && contextual.length <= linkMax, `${at}.links.contextual: ${linkMin}–${linkMax} статей /s для ссылок в тексте (опубликованные или статьи этого пакета)`, errors);
  need(readmore.length === 3, `${at}.links.readmore: ровно 3 статьи для «Читайте также»`, errors);
  for (const target of [...contextual, ...readmore]) need(SLUG.test(target) && target !== slug, `${at}.links: плохой slug «${target}»`, errors);
  need(new Set(readmore).size === 3, `${at}.links.readmore: без повторов`, errors);
  const extras = parseBriefExtras(raw);
  return {
    slug,
    query,
    title,
    topic,
    intent: String(raw?.intent ?? "").trim(),
    audience: String(raw?.audience ?? "").trim(),
    storyHint: String(raw?.storyHint ?? "").trim(),
    practice: {
      title: practice.title,
      subtitle: String(practice.subtitle ?? "").trim(),
      author: practice.author ?? SZ.practiceAuthor,
      duration: practice.duration,
      path: practice.path,
      materials: String(practice.materials ?? "").trim(),
    },
    experts,
    links: { contextual, readmore, anchors: extras.anchors },
    facts: list(raw?.facts).map(String),
    commonMistakes: list(raw?.commonMistakes).map(String),
    sectionsHint: list(raw?.sectionsHint).map(String),
    tableHint: String(raw?.tableHint ?? "").trim(),
    disclaimerExtra: String(raw?.disclaimerExtra ?? "").trim(),
    phones: String(raw?.phones ?? "").trim(),
    verbatim: list(raw?.verbatim).map(String),
    forbiddenPhrases: list(raw?.forbiddenPhrases).map(String),
    additionalQueries: extras.additionalQueries,
    additionalQueryForms: extras.additionalQueryForms,
    faqHints: extras.faqHints,
    examplePhrases: extras.examplePhrases,
    storyHeroine: extras.storyHeroine,
    extraInstructions: list(raw?.extraInstructions).map(String),
  };
}

function parseAdditionalQueries(rawList) {
  const queries = [];
  const forms = {};
  for (const item of list(rawList)) {
    if (typeof item === "string") {
      const text = item.trim();
      if (text) queries.push(text);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const text = String(item.text ?? item.query ?? "").trim();
    if (!text) continue;
    queries.push(text);
    const variants = list(item.forms).map((form) => String(form).trim()).filter(Boolean);
    if (variants.length) forms[text] = variants;
  }
  return { queries, forms };
}

function parseBriefExtras(raw) {
  const { queries, forms } = parseAdditionalQueries(raw?.additionalQueries ?? raw?.secondaryKeywords);
  const anchors = [];
  for (const item of list(raw?.links?.anchors)) {
    if (!item || typeof item !== "object") continue;
    const anchor = String(item.anchor ?? "").trim();
    const slug = String(item.slug ?? "").trim();
    const href = String(item.href ?? (slug ? `/s/${slug}` : "")).trim();
    if (anchor && href) anchors.push({ anchor, slug, href });
  }
  const faqHints = [];
  for (const item of list(raw?.faqHints)) {
    const match = String(item?.match ?? "").trim();
    const stance = String(item?.stance ?? "").trim().toLocaleLowerCase("ru");
    if (match && (stance === "да" || stance === "нет")) faqHints.push({ match, stance });
  }
  let examplePhrases = null;
  if (raw?.examplePhrases && typeof raw.examplePhrases === "object") {
    const min = Number(raw.examplePhrases.min);
    const max = Number(raw.examplePhrases.max);
    if (Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= min) examplePhrases = { min, max };
  }
  return {
    additionalQueries: queries,
    additionalQueryForms: forms,
    faqHints,
    examplePhrases,
    storyHeroine: String(raw?.storyHeroine ?? "").trim(),
    anchors,
  };
}
