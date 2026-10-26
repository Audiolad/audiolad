// Tiered repair (--repair-mode tiered only). Deterministic fixes, then one failing
// fragment at a time on the cheap model, then GPT-5.5 for that fragment after N
// misses. The full article is never the request. The full gate runs after each apply.
import { BudgetError } from "../../call.mjs";
import { estimatePromptTokens, worstCaseRub } from "../../cost.mjs";
import { writerCallId } from "../../moscow.mjs";
import { SZ, SZ_BODY_PLAN } from "./config.mjs";
import { normalizeSzFields } from "./assemble.mjs";
import { szH2Count, szQuantityReport } from "./metrics.mjs";
import { MIXED_SCRIPT, PROMISE, SUMMONING, danglingFragment, fieldProseDefect, normalize, words } from "./rules.mjs";

const FRAGMENT_SYSTEM = [
  "Ты – Зоя Петрова. Пиши по-русски, на «вы», тепло и ясно.",
  "Только среднее тире «–» и кавычки «».",
  "Без внешних ссылок, адресов, MAX, обещаний исцеления, гарантий, защиты, оберегов и призыва.",
  "Практику не описывай через дискомфорт и не советуй остановить запись.",
  "Не выдумывай факты и не копируй чужие заголовки. Верни только JSON по схеме.",
].join(" ");

const HOMOGLYPHS = { A: "А", a: "а", B: "В", C: "С", c: "с", E: "Е", e: "е", H: "Н", K: "К", M: "М", O: "О", o: "о", P: "Р", p: "р", T: "Т", X: "Х", x: "х", Y: "У", y: "у" };

// Reasoning models spend the output budget before the JSON. 800 tokens cut off 13 of 18
// live cheap calls. The flag stays the floor; these models get headroom, then one retry.
const REASONING_CHEAP_MODELS = new Set(["openai/gpt-oss-120b", "Qwen/Qwen3.6-35B-A3B"]);
const CHEAP_TOKEN_RETRY_MAX = 16000;

export function cheapTokenCap({ model, fragmentKey = "", configured = 800 } = {}) {
  const floor = configured;
  if (!REASONING_CHEAP_MODELS.has(model)) return floor;
  const wide = /body-length|total-length|story-length/.test(fragmentKey);
  return Math.max(floor, wide ? 4000 : 2400);
}

export function retryTokenCap(cap) {
  return Math.min(CHEAP_TOKEN_RETRY_MAX, Math.max(cap + 1, cap * 2));
}

/** True when the fragment was cut off or is not JSON. A parsed object with finish_reason length still counts. */
export function fragmentTruncated(answer, call) {
  if (String(call?.finishReason ?? "").toLowerCase() === "length") return true;
  if (answer == null) return true;
  if (typeof answer === "string") {
    try {
      JSON.parse(answer);
      return false;
    } catch {
      return true;
    }
  }
  return false;
}

function coerceFragment(answer) {
  if (typeof answer !== "string") return answer;
  try {
    return JSON.parse(answer);
  } catch {
    return null;
  }
}

const CYRILLIC_SLUG = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Latin letters stay. Cyrillic is transliterated. `ogон-в-эзотерике` → `ogon-v-ezoterike`. */
export function latinizeSlug(raw) {
  let out = "";
  for (const char of String(raw).toLocaleLowerCase("ru")) {
    if (/[a-z0-9-]/.test(char)) out += char;
    else if (Object.hasOwn(CYRILLIC_SLUG, char)) out += CYRILLIC_SLUG[char];
  }
  return out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

const objectSchema = (properties) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const stringSchema = { type: "string" };

function mapStrings(value, fn) {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, fn)]));
  return value;
}

export function fixMixedHomoglyphs(text) {
  return String(text).replace(/\p{L}+/gu, (word) => {
    if (!/[A-Za-z]/.test(word) || !/[А-Яа-яЁё]/.test(word)) return word;
    const next = [...word].map((char) => HOMOGLYPHS[char] ?? char).join("");
    return /[A-Za-z]/.test(next) ? word : next;
  });
}

function fixAsciiDash(text) {
  return text.replace(/([а-яё])\s+-\s+([а-яё])/giu, "$1 – $2");
}

/** Longest prefix of complete sentences inside the range. Null when no boundary fits. */
function trimAtSentences(text, { maxChars = null, minChars = 0, maxWords = null, minWords = 0 } = {}) {
  const sentences = [];
  for (const part of String(text).split(/(?<=[.!?…])\s+/u)) {
    const bare = part.trim().replace(/[»"”']+$/u, "");
    if (!/[.!?…]$/u.test(bare)) break;
    sentences.push(part.trim());
  }
  let chosen = null;
  for (let i = 1; i <= sentences.length; i += 1) {
    const candidate = sentences.slice(0, i).join(" ");
    if (maxChars != null && [...candidate].length > maxChars) break;
    if (maxWords != null && words(candidate) > maxWords) break;
    if ([...candidate].length >= minChars && words(candidate) >= minWords) chosen = candidate;
  }
  return chosen;
}

function paragraphHollow(text) {
  return Boolean(fieldProseDefect(text, "paragraph"));
}

function foldExtraSection(sections) {
  let index = sections.length - 1;
  let best = Infinity;
  for (let i = 1; i < sections.length; i += 1) {
    const hollow = (sections[i].paragraphs ?? []).every((paragraph) => paragraphHollow(paragraph));
    const weight = hollow ? -1 : words((sections[i].paragraphs ?? []).join(" "));
    if (weight < best) {
      best = weight;
      index = i;
    }
  }
  const extra = sections[index];
  const hollow = (extra.paragraphs ?? []).every((paragraph) => paragraphHollow(paragraph));
  if (!hollow) {
    const prev = sections[index - 1];
    const combined = [...(prev.paragraphs ?? []), ...(extra.paragraphs ?? [])];
    if (combined.length > 12) return null;
    prev.paragraphs = combined;
  }
  const title = extra.title ?? "";
  sections.splice(index, 1);
  return hollow ? `снят пустой лишний H2 «${title}»` : `слит лишний H2 «${title}» с предыдущим разделом`;
}

function allowedSlugSet(links) {
  return new Set([...(links?.contextual ?? []), ...(links?.readmore ?? [])].filter((slug) => /^[a-z0-9-]+$/.test(slug)));
}

function rewriteHrefs(text, allowed) {
  if (!allowed.size || !text.includes("/s/")) return text;
  return text.replace(/(href="|\]\()(\/s\/[^")\s]+)/g, (full, prefix, href) => {
    if (/^\/s\/[a-z0-9-]+$/.test(href)) return full;
    const slug = latinizeSlug(href.slice(3));
    if (!allowed.has(slug)) return full;
    return `${prefix}/s/${slug}`;
  });
}

function markdownSlugs(fields) {
  const slugs = [];
  const walk = (value) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(/\[[^\]]+\]\(\/s\/([a-z0-9-]+)\)/g)) slugs.push(match[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(fields);
  return slugs;
}

function storyWordCount(fields, transition = fields?.transition) {
  const story = Array.isArray(fields?.story) ? fields.story : [];
  return words([...story, transition ?? ""].join(" "));
}

/** Append one sentence to a body section so it is counted before the FAQ. */
function appendSentence(fields, sentence) {
  const extra = String(sentence ?? "").trim();
  if (!extra) return false;
  for (const key of ["sectionsBefore", "sectionsAfter"]) {
    for (const section of fields[key] ?? []) {
      const paragraphs = section.paragraphs ?? [];
      const index = paragraphs.findIndex((paragraph) => typeof paragraph === "string" && paragraph.trim() && !paragraph.trimStart().startsWith("«"));
      if (index < 0) continue;
      paragraphs[index] = `${paragraphs[index].trim()} ${extra}`.trim();
      return true;
    }
  }
  for (const item of fields.steps?.items ?? []) {
    if (typeof item?.text !== "string" || !item.text.trim()) continue;
    item.text = `${item.text.trim()} ${extra}`.trim();
    return true;
  }
  return false;
}

function collectText(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectText(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectText(item, out));
}

function meaningfulCount(text) {
  return (String(text).match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) ?? []).filter((token) => (token.match(/\p{L}/gu) ?? []).length >= 2).length;
}

/** Brief bans, healing promises, summoning and mixed script. Does not apply a paragraph word floor. */
export function fragmentBanned(value, brief) {
  const texts = [];
  collectText(value, texts);
  if (!texts.length) return false;
  const joined = texts.join("\n");
  if (PROMISE.test(joined) || SUMMONING.test(joined)) return true;
  for (const text of texts) {
    if (text.split(/[^\p{L}-]+/u).some((word) => MIXED_SCRIPT.test(word))) return true;
  }
  const norm = normalize(joined);
  return (brief?.forbiddenPhrases ?? []).some((phrase) => phrase && norm.includes(normalize(phrase)));
}

/** Programmatic fixes. Returns the same fields when nothing was safe to change. */
export function applyDeterministicSzFixes(fields, { query = "", links = null } = {}) {
  const fixes = [];
  let next = mapStrings(structuredClone(fields), (text) => {
    const glyphs = fixMixedHomoglyphs(text);
    const dashed = fixAsciiDash(glyphs);
    if (glyphs !== text) fixes.push("латинская омоглифа внутри кириллического слова заменена");
    if (dashed !== glyphs) fixes.push("дефис между русскими словами заменён на «–»");
    return dashed;
  });
  const beforeNorm = JSON.stringify(next);
  next = normalizeSzFields(next).fields;
  if (beforeNorm.includes("\u2014") && !JSON.stringify(next).includes("\u2014")) fixes.push("длинное тире заменено на «–»");
  const limits = SZ.limits;
  if (typeof next.description === "string" && [...next.description].length > limits.description[1]) {
    const trimmed = trimAtSentences(next.description, { maxChars: limits.description[1], minChars: limits.description[0] });
    if (trimmed && trimmed !== next.description && normalize(trimmed).includes(normalize(query)) && !danglingFragment(trimmed)) {
      next.description = trimmed;
      fixes.push("description обрезан по границе предложения");
    }
  }
  if (typeof next.seoTitle === "string" && [...next.seoTitle].length > limits.seoTitleMax) {
    const trimmed = trimAtSentences(next.seoTitle, { maxChars: limits.seoTitleMax });
    if (trimmed && trimmed !== next.seoTitle && normalize(trimmed).startsWith(normalize(query))) {
      next.seoTitle = trimmed;
      fixes.push("seoTitle обрезан по границе предложения");
    }
  }
  for (const item of next.faq ?? []) {
    if (words(item.answer) > limits.faqAnswer[1]) {
      const trimmed = trimAtSentences(item.answer, { maxWords: limits.faqAnswer[1], minWords: limits.faqAnswer[0] });
      if (trimmed && trimmed !== item.answer && !danglingFragment(trimmed)) {
        item.answer = trimmed;
        fixes.push("длинный ответ FAQ укорочен по предложениям");
      }
    }
  }
  let guard = 0;
  while (szH2Count(next) > limits.bodyH2[1] && guard < 6) {
    guard += 1;
    const key = next.sectionsAfter?.length ? "sectionsAfter" : (next.sectionsBefore?.length > 2 ? "sectionsBefore" : null);
    if (!key || next[key].length < 2) break;
    const note = foldExtraSection(next[key]);
    if (!note) break;
    fixes.push(note);
  }
  const allowed = allowedSlugSet(links);
  if (allowed.size) {
    let slugFixes = 0;
    next = mapStrings(next, (text) => {
      const rewritten = rewriteHrefs(text, allowed);
      if (rewritten !== text) slugFixes += 1;
      return rewritten;
    });
    if (slugFixes) fixes.push("полукириллический slug приведён к ссылке из брифа");
  }
  const contextual = (links?.contextual ?? []).filter((slug) => /^[a-z0-9-]+$/.test(slug));
  if (contextual.length) {
    const present = markdownSlugs(next);
    const seen = new Set(present);
    const missing = contextual.filter((slug) => !seen.has(slug));
    const [minLinks, maxLinks] = limits.contextualLinks;
    for (const slug of missing) {
      if (present.length >= minLinks || present.length >= maxLinks) break;
      if (!appendSentence(next, `Подробнее: [материал](/s/${slug}).`)) break;
      present.push(slug);
      fixes.push(`добавлена внутренняя ссылка /s/${slug}`);
    }
  }
  return { fields: next, fixes };
}

function queryHits(text, query) {
  const nq = normalize(query);
  if (!nq) return 0;
  return normalize(text).split(nq).length - 1;
}

function bodyQueryCount(md, query) {
  const body = String(md).match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)?.[1] ?? "";
  return queryHits(body, query);
}

/** Nominative bolted onto a preposition. The gate accepts the exact query and still misses the grammar. */
function boltedQuerySentence(text, query) {
  if (!query || typeof text !== "string") return false;
  const plants = [
    `Дальше речь пойдёт о ${query}.`,
    `Дальше речь идёт о ${query}.`,
    `Ниже ещё сказано про ${query}.`,
    `Тема ${query} остаётся в этом разделе.`,
  ];
  return plants.some((plant) => text.includes(plant));
}

function findString(value, pattern, path = "") {
  if (typeof value === "string") return pattern.test(value) ? { path, text: value } : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findString(value[i], pattern, `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const found = findString(item, pattern, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

function findBadHref(value, path = "") {
  const scan = (text) => {
    for (const match of String(text).matchAll(/(?:href="|\]\()(\/s\/[^")\s]+)/g)) {
      if (!/^\/s\/[a-z0-9-]+$/.test(match[1])) return match[1];
    }
    return null;
  };
  if (typeof value === "string") {
    const href = scan(value);
    return href ? { path, text: value, href } : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findBadHref(value[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const found = findBadHref(item, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

function setPath(fields, path, text) {
  const next = structuredClone(fields);
  const parts = [...path.matchAll(/([^[\].]+)|\[(\d+)\]/g)].map((match) => (match[1] !== undefined ? match[1] : Number(match[2])));
  let cursor = next;
  for (let i = 0; i < parts.length - 1; i += 1) cursor = cursor[parts[i]];
  cursor[parts.at(-1)] = text;
  return next;
}

function fragment(brief, key, instructions, schema, apply) {
  return {
    key,
    messages: [{ role: "system", content: FRAGMENT_SYSTEM }, { role: "user", content: instructions }],
    schema,
    apply: (current, answer) => {
      const value = coerceFragment(answer);
      if (fragmentBanned(value, brief)) return null;
      return apply(current, value);
    },
  };
}

function shortestExpandable(fields) {
  const sections = [];
  const steps = [];
  for (const key of ["sectionsBefore", "sectionsAfter"]) {
    for (const [index, section] of (fields[key] ?? []).entries()) {
      sections.push({ kind: "section", key, index, path: `${key}[${index}]`, title: section.title ?? "", words: words((section.paragraphs ?? []).join(" ")), paragraphs: section.paragraphs ?? [] });
    }
  }
  for (const [index, item] of (fields.steps?.items ?? []).entries()) {
    steps.push({ kind: "step", index, path: `steps.items[${index}].text`, title: item.title ?? "", words: words(item.text ?? ""), text: item.text ?? "" });
  }
  sections.sort((a, b) => a.words - b.words);
  steps.sort((a, b) => a.words - b.words);
  if (sections[0] && sections[0].words < SZ_BODY_PLAN.sectionsBefore.wordsEach[0]) return sections[0];
  return steps[0] ?? sections[0] ?? null;
}

/** One failing fragment. Null when the only safe fix would be the whole article. */
export function buildSzFragment(brief, fields, failure) {
  const limits = SZ.limits;
  if (failure.code === "description-length" || failure.code === "description-fragment") {
    const description = fields.description ?? "";
    return fragment(brief, `${failure.code}:description`, [
      `description сейчас ${[...description].length} символов. Нужно ровно ${limits.description[0]}–${limits.description[1]}, одно или несколько целых предложений с точкой в конце.`,
      `Запрос «${brief.query}» должен входить в текст. Не обрывай фразу и не присылай статью целиком.`,
      "",
      description,
    ].join("\n"), objectSchema({ description: stringSchema }), (current, answer) => {
      const text = answer?.description;
      if (typeof text !== "string" || fieldProseDefect(text, "description") || danglingFragment(text)) return null;
      const length = [...text].length;
      if (length < limits.description[0] || length > limits.description[1]) return null;
      if (!normalize(text).includes(normalize(brief.query))) return null;
      return { ...current, description: text };
    });
  }
  if (failure.code === "seoTitle-length" || failure.code === "seoTitle-query") {
    const seoTitle = fields.seoTitle ?? "";
    return fragment(brief, "seoTitle:seoTitle", [
      `seoTitle сейчас ${[...seoTitle].length} символов. Нужно не больше ${limits.seoTitleMax}, начинается с запроса «${brief.query}», не совпадает с H1 «${brief.title}».`,
      "",
      seoTitle,
    ].join("\n"), objectSchema({ seoTitle: stringSchema }), (current, answer) => {
      const text = answer?.seoTitle;
      if (typeof text !== "string" || fieldProseDefect(text, "seoTitle")) return null;
      if ([...text].length > limits.seoTitleMax || text === brief.title) return null;
      if (!normalize(text).startsWith(normalize(brief.query))) return null;
      return { ...current, seoTitle: text };
    });
  }
  if (failure.code === "faq-length" || failure.code === "faq-fragment") {
    const index = Number(failure.path?.match(/faq\[(\d+)\]/)?.[1]);
    const item = fields.faq?.[index];
    if (!item) return null;
    return fragment(brief, `${failure.code}:faq[${index}].answer`, [
      `Ответ FAQ сейчас ${words(item.answer)} слов. Нужно ${limits.faqAnswer[0]}–${limits.faqAnswer[1]} (ориентир 45–70), целыми предложениями.`,
      `Вопрос не меняй: «${item.question}».`,
      "Верни JSON { answer } – только этот ответ, без оборванной фразы.",
      "",
      item.answer,
    ].join("\n"), objectSchema({ answer: stringSchema }), (current, answer) => {
      const text = answer?.answer;
      if (typeof text !== "string" || fieldProseDefect(text, "faq.answer") || danglingFragment(text)) return null;
      const count = words(text);
      if (count < limits.faqAnswer[0] || count > limits.faqAnswer[1]) return null;
      const faq = current.faq.map((entry, entryIndex) => (entryIndex === index ? { ...entry, answer: text } : entry));
      return { ...current, faq };
    });
  }
  if (failure.code === "unique-pack" && failure.path?.includes("faq[")) {
    const index = Number(failure.path.match(/faq\[(\d+)\]/)?.[1]);
    const item = fields.faq?.[index];
    if (!item) return null;
    return fragment(brief, `unique-pack:faq[${index}].question`, [
      `Вопрос FAQ повторяется: «${item.question}».`,
      "Придумай другой вопрос по той же теме, не копируя формулировку. Ответ не меняй.",
      "Верни JSON { question }.",
    ].join("\n"), objectSchema({ question: stringSchema }), (current, answer) => {
      const text = answer?.question;
      if (typeof text !== "string" || fieldProseDefect(text, "faq.question")) return null;
      if (normalize(text) === normalize(item.question)) return null;
      const faq = current.faq.map((entry, entryIndex) => (entryIndex === index ? { ...entry, question: text } : entry));
      return { ...current, faq };
    });
  }
  if (failure.code === "transition-query") {
    const transition = fields.transition ?? "";
    const storyWords = storyWordCount(fields) - words(transition);
    const room = limits.story[1] - storyWords;
    const [minQuery, maxQuery] = limits.mainQuery;
    const count = Number.isFinite(failure.queryCount) ? failure.queryCount : null;
    const lines = [
      `Последний абзац истории должен содержать запрос «${brief.query}» дословно, в этой форме, без кавычек вокруг запроса.`,
      "Согласуй падеж вокруг запроса. Не приставляй именительный падеж к предлогу и не дописывай шаблонное предложение.",
      `Вместе с историей переход должен уложиться в ${limits.story[0]}–${limits.story[1]} слов. На сам переход остаётся около ${Math.max(room, 12)} слов.`,
    ];
    if (count != null && count >= maxQuery) {
      lines.push(`В тексте запрос уже встречается ${count} раз, диапазон ${minQuery}–${maxQuery}. Перепиши только этот абзац так, чтобы суммарное число вхождений осталось в диапазоне ${minQuery}–${maxQuery}.`);
    } else if (count != null) {
      lines.push(`Сейчас в тексте ${count} вхождений, нужно ${minQuery}–${maxQuery}. Суммарное число не должно стать больше ${maxQuery}.`);
    }
    lines.push("Верни JSON { transition } – только этот абзац.", "", transition);
    return fragment(brief, "transition-query:transition", lines.join("\n"), objectSchema({ transition: stringSchema }), (current, answer) => {
      const text = answer?.transition;
      if (typeof text !== "string" || fieldProseDefect(text, "transition") || danglingFragment(text)) return null;
      if (!normalize(text).includes(normalize(brief.query)) || text.includes(`«${brief.query}»`)) return null;
      if (boltedQuerySentence(text, brief.query)) return null;
      const total = storyWordCount(current, text);
      if (total < limits.story[0] || total > limits.story[1]) return null;
      if (count != null) {
        const nextCount = count - queryHits(transition, brief.query) + queryHits(text, brief.query);
        if (nextCount > maxQuery) return null;
      }
      return { ...current, transition: text };
    });
  }
  if (failure.code === "story-length") {
    const actual = failure.actual ?? storyWordCount(fields);
    const min = failure.min ?? limits.story[0];
    const max = failure.max ?? limits.story[1];
    if (actual >= min) return null;
    const need = Math.min(120, Math.max(40, min - actual));
    return fragment(brief, "story-length:story", [
      `История вместе с переходом сейчас ${actual} слов. Нужно ${min}–${max}.`,
      `Добавь 1–2 новых абзаца примерно на ${need} слов. Переход и остальные разделы не присылай.`,
      "Верни JSON { paragraphs } – только новые абзацы истории.",
      "",
      ...(fields.story ?? []),
    ].join("\n"), objectSchema({ paragraphs: { type: "array", minItems: 1, maxItems: 2, items: stringSchema } }), (current, answer) => {
      const paragraphs = answer?.paragraphs;
      if (!Array.isArray(paragraphs) || paragraphs.length < 1 || paragraphs.length > 2) return null;
      if (paragraphs.some((paragraph) => typeof paragraph !== "string" || fieldProseDefect(paragraph, "story") || danglingFragment(paragraph))) return null;
      const story = [...(current.story ?? []), ...paragraphs];
      const total = storyWordCount({ ...current, story });
      if (total < min || total > max) return null;
      return { ...current, story };
    });
  }
  if (failure.code === "expert-thesis") {
    const name = String(failure.message ?? "").split(":")[0].trim();
    const index = (fields.experts ?? []).findIndex((expert) => expert?.name === name);
    if (index < 0) return null;
    return fragment(brief, `expert-thesis:experts[${index}].thesis`, [
      `Тезис эксперта ${name} слишком короткий. Нужно 3–7 содержательных слов, без обещаний и запрещённых фраз.`,
      "Имя эксперта не меняй. Верни JSON { thesis } – только тезис.",
      "",
      fields.experts[index].thesis ?? "",
    ].join("\n"), objectSchema({ thesis: stringSchema }), (current, answer) => {
      const text = answer?.thesis;
      if (typeof text !== "string" || fieldProseDefect(text, "experts.thesis")) return null;
      const meaningful = meaningfulCount(text);
      if (meaningful < 3 || meaningful > 7) return null;
      const experts = current.experts.map((expert, expertIndex) => (expertIndex === index ? { ...expert, thesis: text } : expert));
      return { ...current, experts };
    });
  }
  if (failure.code === "links-internal") {
    const found = findBadHref(fields);
    if (!found?.path) return null;
    const allowed = [...allowedSlugSet(brief.links)];
    return fragment(brief, `links-internal:${found.path}`, [
      `Ссылка ${found.href} сломана: в slug смешаны алфавиты или есть лишние символы.`,
      `Оставь только ссылку вида /s/<slug> из списка: ${allowed.map((slug) => `/s/${slug}`).join(", ") || "нет разрешённых"}.`,
      "Верни JSON { text } – только этот фрагмент.",
      "",
      found.text,
    ].join("\n"), objectSchema({ text: stringSchema }), (current, answer) => {
      const text = answer?.text;
      if (typeof text !== "string" || fieldProseDefect(text, found.path)) return null;
      if (findBadHref(text)) return null;
      const slugs = [...text.matchAll(/\[[^\]]+\]\(\/s\/([a-z0-9-]+)\)/g)].map((match) => match[1]);
      if (allowed.length && slugs.some((slug) => !allowed.includes(slug))) return null;
      return setPath(current, found.path, text);
    });
  }
  if (failure.code === "links-contextual" && (failure.actual ?? 0) < (failure.min ?? limits.contextualLinks[0])) {
    const have = new Set(markdownSlugs(fields));
    const missing = (brief.links?.contextual ?? []).filter((slug) => /^[a-z0-9-]+$/.test(slug) && !have.has(slug));
    const slug = missing[0];
    if (!slug) return null;
    return fragment(brief, "links-contextual:sections", [
      `В тексте ${failure.actual ?? "меньше"} внутренних ссылок, нужно ${failure.min ?? limits.contextualLinks[0]}–${failure.max ?? limits.contextualLinks[1]}.`,
      `Добавь одно предложение со ссылкой [материал](/s/${slug}). Других адресов не добавляй.`,
      "Верни JSON { sentence } – только это предложение.",
    ].join("\n"), objectSchema({ sentence: stringSchema }), (current, answer) => {
      const text = answer?.sentence;
      if (typeof text !== "string" || fieldProseDefect(text, "paragraph") || danglingFragment(text)) return null;
      if (!text.includes(`](/s/${slug})`)) return null;
      if (findBadHref(text)) return null;
      const copy = structuredClone(current);
      if (!appendSentence(copy, text)) return null;
      const count = markdownSlugs(copy).length;
      if (count < (failure.min ?? limits.contextualLinks[0]) || count > limits.contextualLinks[1]) return null;
      return copy;
    });
  }
  if (failure.code === "query-count" && (failure.actual ?? 0) < (failure.min ?? limits.mainQuery[0])) {
    const max = failure.max ?? limits.mainQuery[1];
    if ((failure.actual ?? 0) >= max) return null;
    return fragment(brief, "query-count:sections", [
      `Запрос «${brief.query}» встречается в тексте ${failure.actual ?? "меньше нужного"} раз. Нужно ${failure.min ?? limits.mainQuery[0]}–${max}.`,
      "Верни JSON { sentence }: одно грамматичное предложение, где запрос стоит в точной форме и без кавычек вокруг него.",
      `Не приставляй именительный падеж к предлогу. После добавления вхождений должно остаться не больше ${max}.`,
    ].join("\n"), objectSchema({ sentence: stringSchema }), (current, answer) => {
      const text = answer?.sentence;
      if (typeof text !== "string" || fieldProseDefect(text, "paragraph") || danglingFragment(text)) return null;
      if (!normalize(text).includes(normalize(brief.query)) || text.includes(`«${brief.query}»`)) return null;
      if (boltedQuerySentence(text, brief.query)) return null;
      const hits = queryHits(text, brief.query);
      if ((failure.actual ?? 0) + hits > max) return null;
      const copy = structuredClone(current);
      if (!appendSentence(copy, text)) return null;
      return copy;
    });
  }
  if ((failure.code === "body-length" || failure.code === "total-length") && (failure.actual ?? 0) < (failure.min ?? (failure.code === "total-length" ? limits.total[0] : limits.mainBody[0]))) {
    const target = shortestExpandable(fields);
    if (!target) return null;
    const goal = failure.code === "body-length" ? SZ_BODY_PLAN.target[0] : failure.min;
    const need = Math.min(160, Math.max(40, goal - failure.actual));
    const scope = failure.code === "body-length" ? "Основная часть статьи" : "Статья целиком";
    if (target.kind === "step") {
      return fragment(brief, `${failure.code}:${target.path}`, [
        `Шаг «${target.title}» сейчас ${target.words} слов. ${scope} ${failure.actual} слов, нужно минимум ${failure.min}, цель ${goal}.`,
        `Допиши этот шаг примерно на ${need} слов. Не повторяй уже сказанное и не добавляй ссылки.`,
        "Верни JSON { text } – полный новый текст шага.",
        "",
        target.text,
      ].join("\n"), objectSchema({ text: stringSchema }), (current, answer) => {
        const text = answer?.text;
        if (typeof text !== "string" || fieldProseDefect(text, "steps.text") || words(text) <= target.words) return null;
        const steps = structuredClone(current.steps);
        steps.items[target.index] = { ...steps.items[target.index], text };
        return { ...current, steps };
      });
    }
    return fragment(brief, `${failure.code}:${target.path}`, [
      `Раздел «${target.title}» сейчас ${target.words} слов. ${scope} ${failure.actual} слов, нужно минимум ${failure.min}, цель ${goal}.`,
      `Добавь 1–2 новых абзаца примерно на ${need} слов. Не повторяй уже сказанное и не добавляй ссылки.`,
      "Верни JSON { paragraphs } – только новые абзацы.",
      "",
      ...target.paragraphs,
    ].join("\n"), objectSchema({ paragraphs: { type: "array", maxItems: 2, items: stringSchema } }), (current, answer) => {
      const paragraphs = answer?.paragraphs;
      if (!Array.isArray(paragraphs) || !paragraphs.length || paragraphs.length > 2) return null;
      if (paragraphs.some((paragraph) => typeof paragraph !== "string" || fieldProseDefect(paragraph, "paragraph"))) return null;
      const sections = structuredClone(current[target.key]);
      sections[target.index] = { ...sections[target.index], paragraphs: [...sections[target.index].paragraphs, ...paragraphs] };
      return { ...current, [target.key]: sections };
    });
  }
  if (failure.code === "summoning" || failure.code === "forbidden" || failure.code === "mixed-script") {
    const banned = failure.message.match(/«([^»]+)»/)?.[1] ?? "";
    const pattern = failure.code === "mixed-script"
      ? /[A-Za-zА-Яа-яЁё]*[A-Za-z][А-Яа-яЁё]|[A-Za-zА-Яа-яЁё]*[А-Яа-яЁё][A-Za-z]/u
      : (failure.code === "summoning" ? SUMMONING : new RegExp(banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
    const found = findString(fields, pattern);
    if (!found?.path) return null;
    return fragment(brief, `${failure.code}:${found.path}`, [
      `В этом фрагменте ошибка «${failure.code}»: ${failure.message}`,
      "Перепиши только его, убери причину ошибки, сохрани смысл. Без оберегов, защиты и внешних ссылок.",
      "Верни JSON { text }.",
      "",
      found.text,
    ].join("\n"), objectSchema({ text: stringSchema }), (current, answer) => {
      const text = answer?.text;
      if (typeof text !== "string" || fieldProseDefect(text, found.path)) return null;
      if (failure.code === "forbidden" ? normalize(text).includes(normalize(banned)) : pattern.test(text)) return null;
      return setPath(current, found.path, text);
    });
  }
  return null;
}

const PRIORITY = ["mixed-script", "em-dash", "links-internal", "description-length", "description-fragment", "seoTitle-length", "seoTitle-query", "transition-query", "story-length", "expert-thesis", "faq-length", "faq-fragment", "links-contextual", "query-count", "body-length", "total-length", "body-sections", "summoning", "forbidden", "unique-pack"];

function failureKey(failure) {
  return `${failure.code}:${failure.path ?? failure.field}`;
}

function pickFailure(failures, cheapTries, strongTries, cheapLimit) {
  const rank = (code) => {
    const index = PRIORITY.indexOf(code);
    return index < 0 ? PRIORITY.length : index;
  };
  const ranked = [...failures].sort((a, b) => rank(a.code) - rank(b.code) || String(a.path).localeCompare(String(b.path)));
  return ranked.find((failure) => {
    const key = failureKey(failure);
    const cheap = cheapTries.get(key) ?? 0;
    const strong = strongTries.get(key) ?? 0;
    return cheap < cheapLimit || strong < 1;
  }) ?? null;
}

/** Moscow call name for one tiered attempt. Unique per article while `used` is shared. */
export function tieredRepairCallName({ slug, tier, attempt, fragmentKey, used }) {
  return writerCallId(`${slug}-repair-${tier}-${attempt}-${fragmentKey}`, { used });
}

function tierSpent(attempts, tier) {
  return attempts.filter((attempt) => attempt.tier === tier).reduce((sum, attempt) => sum + attempt.costRub, 0);
}

function lastCall(state, name) {
  const calls = state?.calls ?? [];
  for (let i = calls.length - 1; i >= 0; i -= 1) if (calls[i].name === name) return calls[i];
  return null;
}

function invokeFragment({ tier, slug, attempt, fragmentJob, callTier, state, callIds, maxTokens }) {
  const name = tieredRepairCallName({ slug, tier, attempt, fragmentKey: fragmentJob.key, used: callIds });
  const answer = callTier(tier, name, fragmentJob.messages, fragmentJob.schema, { maxTokens });
  return { name, answer, truncated: fragmentTruncated(answer, lastCall(state, name)) };
}

function acceptFragment(fragmentJob, fields, first, second) {
  if (second) {
    const retry = fragmentJob.apply(fields, second.answer);
    if (retry) return retry;
  }
  return fragmentJob.apply(fields, first.answer);
}

/**
 * Repair until checkSzArticle is clean, or until every fragment has used its cheap
 * tries and one strong try. callTier(tier, name, messages, schema, { maxTokens }) performs the model call.
 * A truncated cheap call is retried once with a larger cap and still counts as one try.
 */
export function repairSzArticleTiered({ brief, raw, build, repair, callTier, state = { spentRub: 0, calls: [], warnings: [] }, args = {}, callIds = new Set() }) {
  const errorsOf = (result) => result.problems.filter((problem) => problem.severity === "error");
  const settle = (value) => {
    const deterministic = applyDeterministicSzFixes(value, { query: brief.query, links: brief.links });
    return { fields: deterministic.fields, result: build(deterministic.fields), fixes: deterministic.fixes };
  };
  const errorsBeforeRepair = errorsOf(build(raw));
  const settled = settle(raw);
  let fields = settled.fields;
  let result = settled.result;
  const deterministic = { fixes: settled.fixes };
  const attempts = [];
  const cheapTries = new Map();
  const strongTries = new Map();
  const allowModel = !args.offline && !args["no-repair"];
  const maxRounds = repair.maxRounds ?? 12;
  for (let round = 0; round < maxRounds && allowModel && errorsOf(result).length; round += 1) {
    const { failures } = szQuantityReport(fields, errorsOf(result));
    const failure = pickFailure(failures, cheapTries, strongTries, repair.cheapTries);
    if (!failure) break;
    failure.queryCount = bodyQueryCount(result.md, brief.query);
    const key = failureKey(failure);
    const fragmentJob = buildSzFragment(brief, fields, failure);
    if (!fragmentJob) {
      cheapTries.set(key, repair.cheapTries);
      strongTries.set(key, 1);
      continue;
    }
    const tier = (cheapTries.get(key) ?? 0) >= repair.cheapTries ? "strong" : "cheap";
    const model = tier === "strong" ? repair.strongModel : repair.cheapModel;
    const configured = tier === "strong" ? repair.strongMaxTokens : repair.cheapMaxTokens;
    const maxTokens = tier === "strong" ? configured : cheapTokenCap({ model, fragmentKey: fragmentJob.key, configured });
    const budget = tier === "strong" ? repair.strongBudget : repair.cheapBudget;
    const promptTokens = estimatePromptTokens(fragmentJob.messages, model);
    const worst = worstCaseRub(model, promptTokens, maxTokens);
    if (tierSpent(attempts, tier) + worst > budget) {
      state.warnings.push(`${brief.slug}: ярус ${tier} остановлен бюджетом ${budget} ₽`);
      // A blocked strong try is used up. Later fragments can still take their cheap tries.
      if (tier === "cheap") cheapTries.set(key, repair.cheapTries);
      else strongTries.set(key, 1);
      continue;
    }
    const before = state.spentRub ?? 0;
    const attempt = tier === "cheap" ? (cheapTries.get(key) ?? 0) : (strongTries.get(key) ?? 0);
    let first = null;
    try {
      first = invokeFragment({ tier, slug: brief.slug, attempt, fragmentJob, callTier, state, callIds, maxTokens });
    } catch (error) {
      if (!(error instanceof BudgetError) && error?.code !== 5) throw error;
      state.warnings.push(`${brief.slug}: ярус ${tier} остановлен общим бюджетом`);
      if (tier === "cheap") cheapTries.set(key, repair.cheapTries);
      else strongTries.set(key, 1);
      continue;
    }
    let second = null;
    if (first.truncated) {
      const retryCap = retryTokenCap(maxTokens);
      const spentNow = (state.spentRub ?? 0) - before;
      const retryWorst = worstCaseRub(model, promptTokens, retryCap);
      const room = budget - tierSpent(attempts, tier);
      if (spentNow + retryWorst <= room) {
        try {
          second = invokeFragment({ tier, slug: brief.slug, attempt: `${attempt}-retry`, fragmentJob, callTier, state, callIds, maxTokens: retryCap });
        } catch (error) {
          if (!(error instanceof BudgetError) && error?.code !== 5) throw error;
          state.warnings.push(`${brief.slug}: повтор яруса ${tier} остановлен общим бюджетом`);
        }
      }
    }
    const costRub = (state.spentRub ?? 0) - before;
    const merged = acceptFragment(fragmentJob, fields, first, second);
    if (merged) {
      const again = settle(merged);
      fields = again.fields;
      result = again.result;
    }
    if (tier === "cheap") cheapTries.set(key, (cheapTries.get(key) ?? 0) + 1);
    else strongTries.set(key, (strongTries.get(key) ?? 0) + 1);
    attempts.push({ tier, key: fragmentJob.key, model, costRub, applied: Boolean(merged) });
  }
  const errors = errorsOf(result);
  return {
    result,
    errors,
    errorsBeforeRepair,
    repairSkipped: errors.length ? errors.map((error) => `${error.field}: ${error.message}`).join("; ") : null,
    passed: errors.length === 0,
    deterministic: deterministic.fixes,
    attempts,
  };
}

function chargedCheap(calls, slug) {
  return (calls ?? []).reduce((sum, call) => {
    const name = String(call.name ?? "");
    if (!name.includes("-repair-cheap-")) return sum;
    if (slug && !name.startsWith(`${slug}-`)) return sum;
    return sum + (Number(call.costRub) || 0);
  }, 0);
}

function recordedCheap(items, slug) {
  return items.reduce((sum, item) => {
    if (slug && item.brief.slug !== slug) return sum;
    return sum + (item.attempts ?? []).filter((attempt) => attempt.tier === "cheap").reduce((inner, attempt) => inner + (Number(attempt.costRub) || 0), 0);
  }, 0);
}

/** Cheap-tier rubles already charged. Calls and attempts can describe the same spend; take the larger. */
function cheapSpent(items, state, slug = null) {
  return Math.max(chargedCheap(state?.calls, slug), recordedCheap(items, slug));
}

export function repairSzPackDuplicates({ items, repair, callTier, state, args = {}, callIds = new Set() }) {
  if (args.offline || args["no-repair"]) return;
  const seen = new Set();
  const packCap = repair.cheapBudget * Math.max(items.length, 1);
  for (const item of items) {
    const problems = item.packProblems ?? [];
    for (const problem of problems) {
      if (problem.code !== "unique-pack" || problem.field !== "faq" || problem.slug !== item.brief.slug) continue;
      const question = problem.message.match(/«([^»]+)»/)?.[1];
      const index = item.fields.faq.findIndex((entry) => entry.question === question);
      if (index < 0) continue;
      const key = `${item.brief.slug}:${index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const failure = { code: "unique-pack", field: "faq", path: `faq[${index}].question`, message: problem.message };
      const job = buildSzFragment(item.brief, item.fields, failure);
      if (!job) continue;
      const maxTokens = cheapTokenCap({ model: repair.cheapModel, fragmentKey: job.key, configured: repair.cheapMaxTokens });
      const promptTokens = estimatePromptTokens(job.messages, repair.cheapModel);
      const worst = worstCaseRub(repair.cheapModel, promptTokens, maxTokens);
      const articleSpent = cheapSpent(items, state, item.brief.slug);
      const packSpent = cheapSpent(items, state);
      if (articleSpent + worst > repair.cheapBudget || packSpent + worst > packCap) {
        state.warnings.push(`${item.brief.slug}: ярус cheap остановлен бюджетом ${repair.cheapBudget} ₽`);
        continue;
      }
      const before = state.spentRub ?? 0;
      let first = null;
      try {
        first = invokeFragment({ tier: "cheap", slug: item.brief.slug, attempt: `pack-${index}`, fragmentJob: job, callTier, state, callIds, maxTokens });
      } catch (error) {
        if (!(error instanceof BudgetError) && error?.code !== 5) throw error;
        continue;
      }
      let second = null;
      if (first.truncated) {
        const retryCap = retryTokenCap(maxTokens);
        const spentNow = (state.spentRub ?? 0) - before;
        const retryWorst = worstCaseRub(repair.cheapModel, promptTokens, retryCap);
        const room = Math.min(repair.cheapBudget - articleSpent, packCap - packSpent);
        if (spentNow + retryWorst <= room) {
          try {
            second = invokeFragment({ tier: "cheap", slug: item.brief.slug, attempt: `pack-${index}-retry`, fragmentJob: job, callTier, state, callIds, maxTokens: retryCap });
          } catch (error) {
            if (!(error instanceof BudgetError) && error?.code !== 5) throw error;
          }
        }
      }
      const merged = acceptFragment(job, item.fields, first, second);
      item.attempts = [...(item.attempts ?? []), { tier: "cheap", key: job.key, costRub: (state.spentRub ?? 0) - before, applied: Boolean(merged) }];
      if (!merged) continue;
      item.fields = merged;
      const rebuilt = item.build(merged);
      item.md = rebuilt.md;
      item.fields = rebuilt.fields;
    }
  }
}

