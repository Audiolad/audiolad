// Tiered repair (--repair-mode tiered only). Deterministic fixes, then one failing
// fragment at a time on the cheap model, then GPT-5.5 for that fragment after N
// misses. The full article is never the request. The full gate runs after each apply.
import { BudgetError } from "../../call.mjs";
import { estimatePromptTokens, worstCaseRub } from "../../cost.mjs";
import { writerCallId } from "../../moscow.mjs";
import { SZ, SZ_BODY_PLAN } from "./config.mjs";
import { normalizeSzFields } from "./assemble.mjs";
import { szH2Count, szQuantityReport } from "./metrics.mjs";
import { DISCOMFORT_PATTERNS, MIXED_SCRIPT, PROMISE, SITE_DISCOMFORT, SUMMONING, alignListCount, allowedSiteAddress, danglingFragment, descriptionOpensWithQuotedQuery, faqAnswerTypeMismatch, fieldProseDefect, genericLinkAnchor, gluedLeadBodyLength, hasGluedLead, isSpecialistQuestion, normalize, outgoingAddressProblems, paragraphTokens, paragraphsTooClose, protectedRemovalOk, sectionRetellsStory, words } from "./rules.mjs";

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

/** Output tokens for one length expansion: the new paragraph only, not the article and not the 800 ceiling. */
export function lengthFragmentTokens(needWords, ceiling = 800) {
  const words = Math.max(40, Math.min(160, Number(needWords) || 80));
  return Math.min(ceiling, Math.max(200, Math.ceil(words * 2.2) + 80));
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
  if (typeof next.description === "string" && descriptionOpensWithQuotedQuery(next.description, query)) {
    const opened = naturalDescriptionStart(next.description, query);
    if (opened !== next.description) {
      next.description = opened;
      fixes.push("description начинается с запроса без кавычек и с заглавной");
    }
  }
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
  const removed = dropDuplicateParagraphs(next);
  if (removed) fixes.push(removed === 1 ? "повтор абзаца удалён" : `повторы абзацев удалены: ${removed}`);
  if (typeof next.checklist?.title === "string" && Array.isArray(next.checklist.items)) {
    const aligned = alignListCount(next.checklist.title, next.checklist.items.length);
    if (aligned !== next.checklist.title) {
      next.checklist.title = aligned;
      fixes.push("число в заголовке чек-листа совпало с числом пунктов");
    }
  }
  if (typeof next.steps?.title === "string" && Array.isArray(next.steps.items)) {
    const aligned = alignListCount(next.steps.title, next.steps.items.length);
    if (aligned !== next.steps.title) {
      next.steps.title = aligned;
      fixes.push("число в заголовке шагов совпало с числом шагов");
    }
  }
  return { fields: next, fixes };
}

/** «запрос» at the start becomes «Запрос» plus the rest. No mid-word cut. */
function naturalDescriptionStart(description, query) {
  const match = String(description).match(/^«\s*[^»]+?\s*»\s*/u);
  if (!match || !query) return description;
  const rest = description.slice(match[0].length).trim();
  const chars = [...query];
  if (!chars.length) return description;
  chars[0] = chars[0].toLocaleUpperCase("ru");
  const next = rest ? `${chars.join("")} ${rest}` : chars.join("");
  if (!normalize(next).includes(normalize(query))) return description;
  return next;
}

/**
 * Drops a later exact or near-exact paragraph. The earlier paragraph stays byte-identical,
 * including quotation marks. Single required fields (transition, invitation, steps) are
 * only anchors: a later copy in a paragraph list is removed, the anchor itself is not.
 */
function dropDuplicateParagraphs(fields) {
  const seen = [];
  const drop = [];
  const consider = (text, list = null, index = -1) => {
    if (typeof text !== "string" || !text.trim()) return;
    const close = seen.some((kept) => paragraphsTooClose(kept, text));
    if (close && list) {
      drop.push({ list, index });
      seen.push(text);
      return;
    }
    seen.push(text);
  };
  const walkList = (list) => {
    if (!Array.isArray(list)) return;
    for (let index = 0; index < list.length; index += 1) consider(list[index], list, index);
  };
  walkList(fields.story);
  consider(fields.transition);
  consider(fields.invitation);
  if (Array.isArray(fields.practiceIntro)) walkList(fields.practiceIntro);
  else consider(fields.practiceIntro);
  consider(fields.psychologyIntro);
  for (const section of fields.sectionsBefore ?? []) walkList(section?.paragraphs);
  walkList(fields.tableSection?.paragraphsBefore);
  walkList(fields.tableSection?.paragraphsAfter);
  consider(fields.steps?.intro);
  for (const item of fields.steps?.items ?? []) consider(item?.text);
  for (const section of fields.sectionsAfter ?? []) walkList(section?.paragraphs);
  consider(fields.specialist?.intro);
  consider(fields.storyEnding);
  consider(fields.finalInvite);
  if (!drop.length) return 0;
  const byList = new Map();
  for (const item of drop) {
    const indexes = byList.get(item.list) ?? [];
    indexes.push(item.index);
    byList.set(item.list, indexes);
  }
  for (const [list, indexes] of byList) {
    for (const index of indexes.sort((a, b) => b - a)) list.splice(index, 1);
  }
  return drop.length;
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

/** Any quote mark, an unclosed « “ or „, a markdown blockquote or an HTML blockquote.
 * An apostrophe inside a word (Д'Артаньян) is not a quotation. */
function isQuoteParagraph(text) {
  const raw = String(text ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/(^|\n)\s*>/.test(raw)) return true;
  if (/<\s*\/?\s*blockquote\b/i.test(raw)) return true;
  const withoutApostrophe = trimmed.replace(/(\p{L})['’ʼ](\p{L})/gu, "$1$2");
  return /[«»"“”„‟'‘’‚‛‹›]/u.test(withoutApostrophe);
}

/** Body paragraphs a surplus query may leave. Headings, description, transition, quotes and FAQ stay. */
function surplusParagraphs(fields, title = "") {
  const slots = [];
  const titleNorm = normalize(title);
  const add = (path, text) => {
    if (typeof text !== "string" || !text.trim() || isQuoteParagraph(text)) return;
    if (titleNorm && normalize(text) === titleNorm) return;
    slots.push({ path, text });
  };
  const addList = (path, list) => {
    for (const [index, text] of (list ?? []).entries()) add(`${path}[${index}]`, text);
  };
  const addSections = (key) => {
    for (const [index, section] of (fields[key] ?? []).entries()) addList(`${key}[${index}].paragraphs`, section?.paragraphs);
  };
  addList("story", fields.story);
  add("invitation", fields.invitation);
  add("question", fields.question);
  addList("practiceIntro", Array.isArray(fields.practiceIntro) ? fields.practiceIntro : [fields.practiceIntro]);
  add("psychologyIntro", fields.psychologyIntro);
  addSections("sectionsBefore");
  addList("tableSection.paragraphsBefore", fields.tableSection?.paragraphsBefore);
  addList("tableSection.paragraphsAfter", fields.tableSection?.paragraphsAfter);
  for (const [index, item] of (fields.steps?.items ?? []).entries()) add(`steps.items[${index}].text`, item?.text);
  addSections("sectionsAfter");
  add("specialist.intro", fields.specialist?.intro);
  add("storyEnding", fields.storyEnding);
  add("finalInvite", fields.finalInvite);
  add("finalQuestion", fields.finalQuestion);
  return slots;
}

function findSurplusSlot(fields, query, title = "") {
  const slots = surplusParagraphs(fields, title);
  for (let i = slots.length - 1; i >= 0; i -= 1) {
    if (queryHits(slots[i].text, query) > 0) return slots[i];
  }
  return null;
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

function pathParts(path) {
  return [...String(path).matchAll(/([^[\].]+)|\[(\d+)\]/g)].map((match) => (match[1] !== undefined ? match[1] : Number(match[2])));
}

function getPath(fields, path) {
  const parts = pathParts(path);
  if (!parts.length) return undefined;
  let cursor = fields;
  for (const part of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function setPath(fields, path, text) {
  const next = structuredClone(fields);
  const parts = pathParts(path);
  let cursor = next;
  for (let i = 0; i < parts.length - 1; i += 1) cursor = cursor[parts[i]];
  cursor[parts.at(-1)] = text;
  return next;
}

function phraseSpec(failure) {
  const banned = String(failure.message ?? "").match(/«([^»]+)»/)?.[1] ?? "";
  if (failure.code === "mixed-script") {
    return { kind: "regex", source: "[A-Za-zА-Яа-яЁё]*[A-Za-z][А-Яа-яЁё]|[A-Za-zА-Яа-яЁё]*[А-Яа-яЁё][A-Za-z]", flags: "u" };
  }
  if (failure.code === "summoning") return { kind: "regex", source: SUMMONING.source, flags: SUMMONING.flags.replace(/g/g, "") };
  return { kind: "phrase", phrase: banned };
}

function textHasPhrase(text, spec) {
  if (typeof text !== "string" || !spec) return false;
  if (spec.kind === "phrase") return Boolean(spec.phrase) && normalize(text).includes(normalize(spec.phrase));
  return new RegExp(spec.source, spec.flags).test(text);
}

function findAllStrings(value, spec, path = "") {
  const out = [];
  if (typeof value === "string") {
    if (textHasPhrase(value, spec)) out.push({ path, text: value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...findAllStrings(item, spec, `${path}[${index}]`)));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) out.push(...findAllStrings(item, spec, path ? `${path}.${key}` : key));
  }
  return out;
}

/** One forbidden/summoning/mixed-script gate row becomes one failure per string, so tries are per location. */
function locatePhraseFailures(fields, failures) {
  const out = [];
  for (const failure of failures) {
    if (failure.code !== "forbidden" && failure.code !== "summoning" && failure.code !== "mixed-script") {
      out.push(failure);
      continue;
    }
    const spec = phraseSpec(failure);
    const direct = typeof failure.path === "string" ? getPath(fields, failure.path) : undefined;
    if (typeof direct === "string" && textHasPhrase(direct, spec)) {
      out.push(failure);
      continue;
    }
    const hits = findAllStrings(fields, spec);
    if (!hits.length) {
      out.push(failure);
      continue;
    }
    for (const hit of hits) out.push({ ...failure, field: hit.path, path: hit.path });
  }
  return out;
}

function fragmentDiscomfort(text) {
  if (DISCOMFORT_PATTERNS.some(({ re }) => re.test(text))) return true;
  return SITE_DISCOMFORT.some((pattern) => pattern.test(text));
}

function fragmentLinksRejected(text, brief) {
  if (outgoingAddressProblems(text).length) return true;
  if (/azbyka|wikipedia|litres|max\.ru|max-potok/i.test(text)) return true;
  const allowed = allowedSlugSet(brief?.links);
  for (const match of String(text).matchAll(/(?:href="|\]\()([^")\s]+)/g)) {
    const href = match[1];
    const slug = href.match(/^\/s\/([a-z0-9-]+)$/)?.[1];
    if (slug && allowed.has(slug)) continue;
    if (allowedSiteAddress(href)) continue;
    return true;
  }
  return false;
}

function existingParagraphs(fields, replacing) {
  const texts = [];
  collectText(fields, texts);
  const skip = paragraphTokens(replacing).join(" ");
  let skipped = false;
  return texts.filter((text) => {
    const tokens = paragraphTokens(text);
    if (tokens.length < 8) return false;
    if (!skipped && skip && tokens.join(" ") === skip) {
      skipped = true;
      return false;
    }
    return true;
  });
}

/** One gate for every repair answer: bans, links, discomfort, em dash, templates, near-duplicates. */
function repairOutputRejected(value, brief, current, replacing = "") {
  if (fragmentBanned(value, brief)) return true;
  const texts = [];
  collectText(value, texts);
  const joined = texts.join("\n");
  if (joined.includes("\u2014")) return true;
  if (fragmentDiscomfort(joined)) return true;
  if (texts.some((text) => boltedQuerySentence(text, brief?.query) || fragmentLinksRejected(text, brief))) return true;
  const fresh = texts.filter((text) => paragraphTokens(text).length >= 8);
  const existing = existingParagraphs(current, replacing);
  for (let i = 0; i < fresh.length; i += 1) {
    if (existing.some((other) => paragraphsTooClose(fresh[i], other))) return true;
    for (let j = i + 1; j < fresh.length; j += 1) {
      if (paragraphsTooClose(fresh[i], fresh[j])) return true;
    }
  }
  return false;
}

function fragment(brief, key, instructions, schema, apply, replacing = "") {
  return {
    key,
    messages: [{ role: "system", content: FRAGMENT_SYSTEM }, { role: "user", content: instructions }],
    schema,
    apply: (current, answer) => {
      const value = coerceFragment(answer);
      if (repairOutputRejected(value, brief, current, replacing)) return null;
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

function descriptionDistance(length, min, max) {
  if (length < min) return min - length;
  if (length > max) return length - max;
  return 0;
}

function descriptionTarget(limits = SZ.limits) {
  return Math.round((limits.description[0] + limits.description[1]) / 2);
}

/** An out-of-range description that is otherwise usable as the base of a rewrite. Never a sliced string. */
function descriptionCandidate(answer, brief, fields) {
  const value = coerceFragment(answer);
  const text = value?.description;
  if (typeof text !== "string") return null;
  if (fieldProseDefect(text, "description") || danglingFragment(text)) return null;
  if (!normalize(text).includes(normalize(brief.query))) return null;
  if (repairOutputRejected({ description: text }, brief, fields, fields?.description ?? "")) return null;
  const length = [...text].length;
  const [min, max] = SZ.limits.description;
  const distance = descriptionDistance(length, min, max);
  if (distance === 0) return null;
  return { text, length, distance };
}

function rememberDescription(drafts, key, candidate) {
  if (!candidate) return;
  const target = descriptionTarget();
  const prev = drafts.get(key);
  const closer = !prev
    || candidate.distance < prev.distance
    || (candidate.distance === prev.distance && Math.abs(candidate.length - target) < Math.abs(prev.length - target));
  if (closer) drafts.set(key, candidate);
}

function faqQuestionIndex(fields, failure) {
  const fromPath = String(failure.path ?? "").match(/faq\[(\d+)\]/);
  if (fromPath) {
    const index = Number(fromPath[1]);
    if (fields.faq?.[index]) return index;
  }
  const quoted = String(failure.message ?? "").match(/«([^»]+)»/)?.[1];
  if (quoted) {
    const index = (fields.faq ?? []).findIndex((item) => normalize(item.question) === normalize(quoted));
    if (index >= 0) return index;
  }
  const seen = new Map();
  for (const [index, item] of (fields.faq ?? []).entries()) {
    const key = normalize(item?.question ?? "");
    if (!key) continue;
    if (seen.has(key)) return index;
    seen.set(key, index);
  }
  return -1;
}

function faqQuestionFragment(brief, fields, failure) {
  const specialistSlot = failure.code === "faq-specialist";
  if (specialistSlot && (fields.faq ?? []).some((item) => isSpecialistQuestion(item?.question))) return null;
  const index = specialistSlot ? (fields.faq?.length ?? 0) - 1 : faqQuestionIndex(fields, failure);
  const item = fields.faq?.[index];
  if (!item || index < 0) return null;
  const keepSpecialist = specialistSlot || isSpecialistQuestion(item.question);
  const occupied = failure.occupiedQuestions instanceof Set ? failure.occupiedQuestions : new Set();
  const role = keepSpecialist
    ? "Роль этого слота: вопрос о том, когда обратиться к специалисту или психологу. Перефразируй его уникально, но не заменяй вопросом на другую тему. В вопросе должно остаться обращение к специалисту, психологу или слово «обратиться»."
    : "Роль этого слота: вопрос по теме этой статьи. Не подменяй его вопросом из другой темы.";
  return fragment(brief, `${failure.code}:faq[${index}].question`, [
    specialistSlot
      ? "В FAQ нет вопроса о том, когда обратиться к специалисту или психологу. Перепиши этот слот так, чтобы он стал таким вопросом."
      : `Вопрос FAQ повторяется: «${item.question}».`,
    failure.message ? `Причина: ${failure.message}` : "",
    `Тема статьи: ${brief.title}. Основной запрос: «${brief.query}».`,
    brief.topic ? `Раздел: ${brief.topic}.` : "",
    role,
    "Не копируй формулировку и не повторяй вопрос, который уже есть в другой статье.",
    "Ответ и остальные вопросы не меняй.",
    "Верни JSON { question } – только этот вопрос.",
  ].filter(Boolean).join("\n"), objectSchema({ question: stringSchema }), (current, answer) => {
    const text = answer?.question;
    if (typeof text !== "string" || fieldProseDefect(text, "faq.question")) return null;
    if (keepSpecialist && !isSpecialistQuestion(text)) return null;
    const key = normalize(text);
    if (!key || key === normalize(item.question)) return null;
    if ((current.faq ?? []).some((entry, entryIndex) => entryIndex !== index && normalize(entry.question) === key)) return null;
    if (occupied.has(key)) return null;
    const faq = current.faq.map((entry, entryIndex) => (entryIndex === index ? { ...entry, question: text } : entry));
    return { ...current, faq };
  }, item.question);
}

function findText(value, predicate, path = "") {
  if (typeof value === "string") return predicate(value) ? { path, text: value, title: "" } : null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findText(value[index], predicate, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const found = findText(item, predicate, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

function sectionHasLink(paragraphs, ignoreQuoteLinks = false) {
  return (paragraphs ?? []).some((paragraph) => {
    if (typeof paragraph !== "string" || !paragraph.includes("](/s/")) return false;
    if (ignoreQuoteLinks && isQuoteParagraph(paragraph)) return false;
    return true;
  });
}

function firstOpenParagraph(paragraphs, pathPrefix, skipPath = "") {
  for (const [index, paragraph] of (paragraphs ?? []).entries()) {
    const path = `${pathPrefix}[${index}]`;
    if (skipPath && path === skipPath) continue;
    if (typeof paragraph !== "string" || words(paragraph) < 8 || isQuoteParagraph(paragraph)) continue;
    if (paragraph.includes("](/s/")) continue;
    return { path, text: paragraph };
  }
  return null;
}

/** A non-quote paragraph in a section that does not already contain /s/.
 * ignoreQuoteLinks is only for moving a link out of a quotation: a /s/ that sits
 * inside a quote does not make the section busy. */
function linkHostParagraph(fields, { skipPath = "", ignoreQuoteLinks = false } = {}) {
  for (const key of ["sectionsBefore", "sectionsAfter"]) {
    for (const [index, section] of (fields[key] ?? []).entries()) {
      if (sectionHasLink(section?.paragraphs, ignoreQuoteLinks)) continue;
      const host = firstOpenParagraph(section?.paragraphs, `${key}[${index}].paragraphs`, skipPath);
      if (host) return { ...host, title: section?.title ?? "" };
    }
  }
  const table = fields.tableSection;
  if (table) {
    const prose = [...(table.paragraphsBefore ?? []), ...(table.paragraphsAfter ?? [])];
    if (!sectionHasLink(prose, ignoreQuoteLinks)) {
      const before = firstOpenParagraph(table.paragraphsBefore, "tableSection.paragraphsBefore", skipPath);
      if (before) return { ...before, title: table.title ?? "" };
      const after = firstOpenParagraph(table.paragraphsAfter, "tableSection.paragraphsAfter", skipPath);
      if (after) return { ...after, title: table.title ?? "" };
    }
  }
  for (const [index, item] of (fields.steps?.items ?? []).entries()) {
    const path = `steps.items[${index}].text`;
    if (path === skipPath) continue;
    if (typeof item?.text !== "string" || item.text.includes("](/s/") || isQuoteParagraph(item.text) || words(item.text) < 8) continue;
    return { path, text: item.text, title: item.title ?? "" };
  }
  return null;
}

function markdownLinks(text) {
  return [...String(text ?? "").matchAll(/\[([^\]]+)\]\(\/s\/([a-z0-9-]+)\)/g)].map((match) => ({ anchor: match[1], slug: match[2] }));
}

function endingRejected(text, original) {
  if (danglingFragment(original)) return false;
  return Boolean(danglingFragment(text));
}

function wovenLinkRejected(text, found, slug, brief) {
  if (typeof text !== "string" || fieldProseDefect(text, found.path) || endingRejected(text, found.text)) return true;
  if (text.trim().startsWith(String(found.text).trim())) return true;
  if (hasGluedLead(text)) return true;
  const links = markdownLinks(text);
  const allowed = new Set((brief.links?.contextual ?? []).filter((item) => /^[a-z0-9-]+$/.test(item)));
  if (!links.length || links.some((link) => !allowed.has(link.slug))) return true;
  if (links.some((link) => genericLinkAnchor(link.anchor))) return true;
  if (links.filter((link) => link.slug === slug).length !== 1) return true;
  const oldSlugs = markdownLinks(found.text).map((link) => link.slug);
  for (const old of oldSlugs) {
    if (old !== slug && !links.some((link) => link.slug === old)) return true;
  }
  for (const next of links) {
    if (next.slug !== slug && !oldSlugs.includes(next.slug)) return true;
  }
  return false;
}

function weaveLinkPrompt(found, slug, allowed) {
  return [
    `В этом абзаце раздела «${found.title ?? ""}» ещё нет внутренней ссылки. Вплети в одно существующее предложение одну ссылку на /s/${slug}.`,
    "Анкор называет тему статьи своими словами. Нельзя: «материал», «здесь», «подробнее», «тут», «ссылка», «статья».",
    "Не дописывай отдельное предложение «Подробнее: …» и не ставь две ссылки в конец одного абзаца.",
    `Разрешённые slug: ${allowed.join(", ")}. Других адресов нет.`,
    "Верни JSON { text } – только этот абзац.",
    "",
    "АБЗАЦ:",
    found.text,
  ].join("\n");
}

/** Prose before FAQ, in the same order checkSzArticle numbers generic anchors. */
function anchorProse(fields) {
  const sites = [];
  const push = (path, text, title = "") => {
    if (typeof text !== "string" || !text) return;
    sites.push({ path, text, title });
  };
  const pushList = (list, path, title = "") => {
    (list ?? []).forEach((item, index) => push(`${path}[${index}]`, item, title));
  };
  pushList(fields.story, "story");
  push("transition", fields.transition);
  push("invitation", fields.invitation);
  push("question", fields.question);
  pushList(fields.practiceIntro, "practiceIntro");
  pushList(fields.checklist?.items, "checklist.items");
  push("psychologyIntro", fields.psychologyIntro);
  (fields.experts ?? []).forEach((expert, index) => {
    push(`experts[${index}].thesis`, expert?.thesis);
    push(`experts[${index}].bridge`, expert?.bridge);
  });
  (fields.sectionsBefore ?? []).forEach((section, index) => {
    const title = section?.title ?? "";
    push(`sectionsBefore[${index}].title`, section?.title, title);
    pushList(section?.paragraphs, `sectionsBefore[${index}].paragraphs`, title);
  });
  const table = fields.tableSection;
  if (table) {
    const title = table.title ?? "";
    push("tableSection.title", table.title, title);
    pushList(table.paragraphsBefore, "tableSection.paragraphsBefore", title);
    (table.rows ?? []).forEach((row, rowIndex) => {
      (row ?? []).forEach((cell, cellIndex) => push(`tableSection.rows[${rowIndex}][${cellIndex}]`, cell, title));
    });
    pushList(table.paragraphsAfter, "tableSection.paragraphsAfter", title);
  }
  if (fields.steps) {
    const title = fields.steps.title ?? "";
    push("steps.title", fields.steps.title, title);
    push("steps.intro", fields.steps.intro, title);
    (fields.steps.items ?? []).forEach((item, index) => {
      push(`steps.items[${index}].title`, item?.title, item?.title ?? title);
      push(`steps.items[${index}].text`, item?.text, item?.title ?? title);
    });
  }
  (fields.sectionsAfter ?? []).forEach((section, index) => {
    const title = section?.title ?? "";
    push(`sectionsAfter[${index}].title`, section?.title, title);
    pushList(section?.paragraphs, `sectionsAfter[${index}].paragraphs`, title);
  });
  push("specialist.intro", fields.specialist?.intro);
  pushList(fields.specialist?.items, "specialist.items");
  return sites;
}

function genericAnchorHits(fields) {
  const hits = [];
  for (const site of anchorProse(fields)) {
    for (const link of markdownLinks(site.text)) {
      if (!genericLinkAnchor(link.anchor)) continue;
      hits.push({ ...site, anchor: link.anchor, slug: link.slug });
    }
  }
  return hits;
}

function locateGenericAnchor(fields, failure) {
  const slug = failure.slug || String(failure.message ?? "").match(/\/s\/([a-z0-9-]+)/)?.[1] || "";
  const anchor = failure.anchor || String(failure.message ?? "").match(/анкор «([^»]+)»/)?.[1] || "";
  const indexRaw = String(failure.path ?? "").match(/:(\d+)$/)?.[1] ?? String(failure.message ?? "").match(/#(\d+)/)?.[1];
  const index = indexRaw == null ? Number.NaN : Number(indexRaw);
  const hits = genericAnchorHits(fields);
  if (Number.isInteger(index) && hits[index] && (!slug || hits[index].slug === slug) && (!anchor || hits[index].anchor === anchor)) return hits[index];
  return hits.find((hit) => hit.slug === slug && (!anchor || hit.anchor === anchor)) ?? null;
}

function linkHostIsProtected(path, text) {
  if (/^(?:story|storyEnding)(?:\.|\[|$)/.test(path)) return true;
  return isQuoteParagraph(text);
}

/** Length of one whole lead+link at `index`, plus exactly one space before the lead. 0 inside a word. */
function glueSpanAt(text, index) {
  const body = gluedLeadBodyLength(text, index);
  if (body) return body;
  if (text[index] === " " && gluedLeadBodyLength(text, index + 1)) return 1 + gluedLeadBodyLength(text, index + 1);
  return 0;
}

/** Drop every glued «Подробнее:» / «Читайте также:» sentence anywhere in the paragraph, then a bare copy of this token. */
function stripProtectedLinks(text, anchor, slug) {
  let next = String(text ?? "");
  let guard = 0;
  while (guard < 12) {
    const spans = [];
    for (let index = 0; index < next.length;) {
      const cut = glueSpanAt(next, index);
      if (!cut) {
        index += 1;
        continue;
      }
      spans.push([index, index + cut]);
      index += cut;
    }
    if (!spans.length) break;
    for (const [start, end] of spans.reverse()) next = next.slice(0, start) + next.slice(end);
    guard += 1;
  }
  if (anchor && slug) {
    const token = `[${anchor}](/s/${slug})`;
    const at = next.indexOf(token);
    if (at >= 0) {
      const candidate = next.slice(0, at) + next.slice(at + token.length);
      if (candidate.trim() && protectedRemovalOk(text, candidate)) next = candidate;
    }
  }
  if (!next.trim() || next === text || !protectedRemovalOk(text, next)) return null;
  return next;
}

function splitSentences(text) {
  return String(text).split(/(?<=[.!?…])\s+/u);
}

function linkSetAccepted(text, original, slug, brief) {
  const links = markdownLinks(text);
  const allowed = new Set((brief.links?.contextual ?? []).filter((item) => /^[a-z0-9-]+$/.test(item)));
  if (!links.length || links.some((link) => !allowed.has(link.slug))) return false;
  if (links.some((link) => genericLinkAnchor(link.anchor))) return false;
  if (links.filter((link) => link.slug === slug).length !== 1) return false;
  const oldSlugs = markdownLinks(original).map((link) => link.slug);
  for (const old of oldSlugs) {
    if (!links.some((link) => link.slug === old)) return false;
  }
  for (const next of links) {
    if (!oldSlugs.includes(next.slug)) return false;
  }
  return true;
}

/** In place: one sentence that holds the link may change. Every other sentence stays byte-identical. */
function anchorSentenceAccepted(text, original, anchor, slug, brief, path) {
  if (typeof text !== "string" || text === original) return false;
  if (isQuoteParagraph(original) || isQuoteParagraph(text)) return false;
  if (fieldProseDefect(text, path) || endingRejected(text, original)) return false;
  if (hasGluedLead(text)) return false;
  if (!linkSetAccepted(text, original, slug, brief)) return false;
  const before = splitSentences(original);
  const after = splitSentences(text);
  if (before.length !== after.length || !before.length) return false;
  const token = `[${anchor}](/s/${slug})`;
  let changed = -1;
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] === after[i]) continue;
    if (changed >= 0 || !before[i].includes(token)) return false;
    changed = i;
  }
  if (changed < 0) return false;
  for (const quote of before[changed].match(/«[^»]*»/gu) ?? []) {
    if (!after[changed].includes(quote)) return false;
  }
  return true;
}

function linkFragment(brief, fields, failure) {
  const allowed = (brief.links?.contextual ?? []).filter((item) => /^[a-z0-9-]+$/.test(item));
  if (failure.code === "links-anchor") return anchorFragment(brief, fields, failure, allowed);
  let slug = failure.slug || String(failure.path ?? "").match(/^slug:([a-z0-9-]+)$/)?.[1];
  if (!slug) {
    const have = new Set(markdownSlugs(fields));
    slug = allowed.find((item) => !have.has(item));
  }
  const found = slug ? linkHostParagraph(fields) : null;
  if (!found || !slug || !allowed.includes(slug)) return null;
  const job = fragment(brief, `${failure.code}:${found.path}`, weaveLinkPrompt(found, slug, allowed), objectSchema({ text: stringSchema }), (current, answer) => {
    const text = answer?.text;
    if (wovenLinkRejected(text, found, slug, brief)) return null;
    return setPath(current, found.path, text);
  }, found.text);
  job.outputTokens = 420;
  return job;
}

function anchorFragment(brief, fields, failure, allowed) {
  const host = locateGenericAnchor(fields, failure);
  if (!host || !allowed.includes(host.slug)) return null;
  const { slug, anchor } = host;
  if (linkHostIsProtected(host.path, host.text)) {
    const dest = linkHostParagraph(fields, { skipPath: host.path, ignoreQuoteLinks: true });
    if (!dest) return null;
    const job = fragment(brief, `links-anchor:${dest.path}`, weaveLinkPrompt(dest, slug, allowed), objectSchema({ text: stringSchema }), (current, answer) => {
      const text = answer?.text;
      if (wovenLinkRejected(text, dest, slug, brief)) return null;
      const original = currentPathText(current, host.path, host.text);
      const stripped = stripProtectedLinks(original, anchor, slug);
      if (stripped == null || !protectedRemovalOk(original, stripped)) return null;
      return setPath(setPath(current, dest.path, text), host.path, stripped);
    }, dest.text);
    job.outputTokens = 420;
    return job;
  }
  const job = fragment(brief, `links-anchor:${host.path}`, [
    `В этом абзаце ссылка /s/${slug} стоит с общим анкором «${anchor}». Замени только этот анкор или, самое большее, предложение, в котором стоит ссылка.`,
    "Остальные предложения оставь дословно. Цитаты не трогай и не переписывай абзац целиком.",
    "Анкор называет тему статьи своими словами. Нельзя: «материал», «здесь», «подробнее», «тут», «ссылка», «статья».",
    "Не дописывай отдельное предложение «Подробнее: …».",
    `Разрешённые slug: ${allowed.join(", ")}. Других адресов нет.`,
    "Верни JSON { text } – только этот абзац.",
    "",
    "АБЗАЦ:",
    host.text,
  ].join("\n"), objectSchema({ text: stringSchema }), (current, answer) => {
    const text = answer?.text;
    const original = currentPathText(current, host.path, host.text);
    if (!anchorSentenceAccepted(text, original, anchor, slug, brief, host.path)) return null;
    return setPath(current, host.path, text);
  }, host.text);
  job.outputTokens = 420;
  return job;
}

function currentPathText(fields, path, fallback) {
  const value = getPath(fields, path);
  return typeof value === "string" ? value : fallback;
}


function openingStory(fields) {
  return [...(fields.story ?? []), fields.transition ?? ""].filter((part) => typeof part === "string" && part.trim()).join("\n\n");
}

function retellTarget(fields, failure) {
  const title = String(failure.message ?? "").match(/раздел «([^»]+)»/)?.[1] ?? "";
  const want = normalize(title);
  if (!want) return null;
  for (const key of ["sectionsBefore", "sectionsAfter"]) {
    for (const [index, section] of (fields[key] ?? []).entries()) {
      if (normalize(section?.title) === want) return { key, index, title: section.title ?? title, section };
    }
  }
  if (fields.tableSection && normalize(fields.tableSection.title) === want) {
    return { key: "tableSection", index: 0, title: fields.tableSection.title ?? title, section: fields.tableSection };
  }
  return null;
}

function retellSlots(target, story) {
  const slots = [];
  const push = (list, path) => {
    for (const [index, text] of (list ?? []).entries()) {
      if (typeof text !== "string" || !text.trim() || isQuoteParagraph(text)) continue;
      slots.push({ path: `${path}[${index}]`, text });
    }
  };
  if (target.key === "tableSection") {
    push(target.section.paragraphsBefore, "tableSection.paragraphsBefore");
    push(target.section.paragraphsAfter, "tableSection.paragraphsAfter");
  } else {
    push(target.section.paragraphs, `${target.key}[${target.index}].paragraphs`);
  }
  const guilty = slots.filter((slot) => sectionRetellsStory(story, slot.text));
  return guilty.length ? guilty : slots;
}

function sectionProse(section, key) {
  if (key === "tableSection") return [...(section.paragraphsBefore ?? []), ...(section.paragraphsAfter ?? [])].join("\n\n");
  return (section.paragraphs ?? []).join("\n\n");
}

function storyRetellFragment(brief, fields, failure) {
  const target = retellTarget(fields, failure);
  if (!target) return null;
  const story = openingStory(fields);
  const slots = retellSlots(target, story);
  if (!slots.length) return null;
  const lines = [
    `Раздел «${target.title}» пересказывает историю из начала. Перепиши только эти абзацы: перейди к практическим шагам.`,
    "Не повторяй сюжет, сцену и имена героини. Историю из начала не копируй.",
    "Если в абзаце уже есть ссылка /s/, оставь тот же slug. Новых адресов не добавляй.",
    `Верни JSON { paragraphs } – ровно ${slots.length} абзацев, в том же порядке.`,
    "",
  ];
  slots.forEach((slot, index) => {
    lines.push(`АБЗАЦ ${index + 1}:`, slot.text, "");
  });
  const job = fragment(brief, `story-retell:${target.path ?? `${target.key}[${target.index}]`}`, lines.join("\n"), objectSchema({
    paragraphs: { type: "array", minItems: slots.length, maxItems: slots.length, items: stringSchema },
  }), (current, answer) => {
    const paragraphs = answer?.paragraphs;
    if (!Array.isArray(paragraphs) || paragraphs.length !== slots.length) return null;
    let next = current;
    for (let index = 0; index < slots.length; index += 1) {
      const text = paragraphs[index];
      const slot = slots[index];
      if (typeof text !== "string" || fieldProseDefect(text, slot.path) || danglingFragment(text)) return null;
      const oldSlugs = markdownLinks(slot.text).map((link) => link.slug);
      const newSlugs = markdownLinks(text).map((link) => link.slug);
      if (oldSlugs.some((slug) => !newSlugs.includes(slug))) return null;
      if (newSlugs.some((slug) => !oldSlugs.includes(slug))) return null;
      next = setPath(next, slot.path, text);
    }
    const section = target.key === "tableSection" ? next.tableSection : next[target.key]?.[target.index];
    if (sectionRetellsStory(story, sectionProse(section, target.key))) return null;
    return next;
  }, slots.map((slot) => slot.text).join("\n"));
  job.outputTokens = 480;
  return job;
}

function extraQueryHost(fields, phrase, phrases = []) {
  const needle = normalize(phrase);
  const others = phrases.map((item) => normalize(item)).filter((item) => item && item !== needle);
  const ranked = [];
  const push = (path, text) => {
    if (typeof text !== "string" || words(text) < 8 || isQuoteParagraph(text)) return;
    if (normalize(text).includes(needle)) return;
    ranked.push({ path, text, crowded: others.some((item) => normalize(text).includes(item)) });
  };
  for (const key of ["sectionsBefore", "sectionsAfter"]) {
    for (const [index, section] of (fields[key] ?? []).entries()) {
      for (const [paragraphIndex, paragraph] of (section?.paragraphs ?? []).entries()) push(`${key}[${index}].paragraphs[${paragraphIndex}]`, paragraph);
    }
  }
  for (const [index, paragraph] of (fields.tableSection?.paragraphsBefore ?? []).entries()) push(`tableSection.paragraphsBefore[${index}]`, paragraph);
  for (const [index, paragraph] of (fields.tableSection?.paragraphsAfter ?? []).entries()) push(`tableSection.paragraphsAfter[${index}]`, paragraph);
  for (const [index, item] of (fields.steps?.items ?? []).entries()) push(`steps.items[${index}].text`, item?.text);
  ranked.sort((a, b) => Number(a.crowded) - Number(b.crowded));
  return ranked[0] ?? null;
}

function extraQueryFragment(brief, fields, failure) {
  const phrase = String(failure.message ?? "").match(/дополнительный запрос «([^»]+)»/)?.[1] ?? "";
  if (!phrase) return null;
  const found = extraQueryHost(fields, phrase, brief.additionalQueries ?? []);
  if (!found) return null;
  const max = SZ.limits.mainQuery[1];
  const job = fragment(brief, `extra-query:${failure.path ?? phrase}`, [
    `Дополнительный запрос «${phrase}» должен встретиться в тексте хотя бы один раз, дословно и без кавычек.`,
    "Вплети его в существующее предложение этого абзаца. Не дописывай отдельное шаблонное предложение и не копируй другие разделы.",
    `Основной запрос «${brief.query}» не добавляй, если из-за этого его станет больше ${max}.`,
    "Верни JSON { text } – только этот абзац.",
    "",
    "АБЗАЦ:",
    found.text,
  ].join("\n"), objectSchema({ text: stringSchema }), (current, answer) => {
    const text = answer?.text;
    if (typeof text !== "string" || fieldProseDefect(text, found.path) || endingRejected(text, found.text)) return null;
    if (!normalize(text).includes(normalize(phrase)) || text.includes(`«${phrase}»`)) return null;
    if (text.trim().startsWith(found.text.trim())) return null;
    const actual = Number.isFinite(failure.queryCount) ? failure.queryCount : null;
    if (actual != null) {
      const next = actual - queryHits(found.text, brief.query) + queryHits(text, brief.query);
      if (next > max) return null;
    }
    return setPath(current, found.path, text);
  }, found.text);
  job.outputTokens = 420;
  return job;
}

function faqAnswerFragment(brief, fields, failure) {
  const index = Number(String(failure.path ?? "").match(/faq\[(\d+)\]/)?.[1]);
  const item = fields.faq?.[index];
  if (!item) return null;
  const limits = SZ.limits;
  const job = fragment(brief, `faq-answer-type:faq[${index}].answer`, [
    `Вопрос открытый: «${item.question}».`,
    "Ответ не начинай с «Да», «Нет», «Можно», «Нельзя», «Конечно» или «Разумеется». Ответь по сути вопроса.",
    `Нужно ${limits.faqAnswer[0]}–${limits.faqAnswer[1]} слов, целыми предложениями. Вопрос не меняй.`,
    "Верни JSON { answer } – только этот ответ.",
    "",
    item.answer,
  ].join("\n"), objectSchema({ answer: stringSchema }), (current, answer) => {
    const text = answer?.answer;
    if (typeof text !== "string" || fieldProseDefect(text, "faq.answer") || danglingFragment(text)) return null;
    if (faqAnswerTypeMismatch(item.question, text)) return null;
    const count = words(text);
    if (count < limits.faqAnswer[0] || count > limits.faqAnswer[1]) return null;
    const faq = current.faq.map((entry, entryIndex) => (entryIndex === index ? { ...entry, answer: text } : entry));
    return { ...current, faq };
  }, item.answer);
  job.outputTokens = 320;
  return job;
}

/** One failing fragment. Null when the only safe fix would be the whole article. */
export function buildSzFragment(brief, fields, failure) {
  const limits = SZ.limits;
  if (failure.code === "description-length" || failure.code === "description-fragment") {
    const articleDescription = fields.description ?? "";
    const description = typeof failure.descriptionDraft === "string" && failure.descriptionDraft
      ? failure.descriptionDraft
      : articleDescription;
    const length = [...description].length;
    const [min, max] = limits.description;
    const target = descriptionTarget(limits);
    const lines = [
      `description сейчас ${length} символов. Цель ровно ${target} символов, допустимо ${min}–${max}.`,
      `Запрос «${brief.query}» должен входить в текст. Одно или несколько целых предложений с точкой в конце.`,
    ];
    if (length > max) lines.push(`Вариант длиннее диапазона. Перепиши его короче целыми предложениями, ближе к ${target}. Не обрезай слово посередине и не отрезай хвост механически.`);
    else if (length < min) lines.push(`Вариант короче диапазона. Допиши целыми предложениями ближе к ${target}. Не обрывай фразу.`);
    lines.push(`Не начинай description с запроса в кавычках («${brief.query}») и не со строчной буквы. Первое слово – с заглавной, запрос вплетён в фразу.`);
    lines.push("Не присылай статью целиком.", "", description);
    return fragment(brief, `${failure.code}:description`, lines.join("\n"), objectSchema({ description: stringSchema }), (current, answer) => {
      const text = answer?.description;
      if (typeof text !== "string" || fieldProseDefect(text, "description") || danglingFragment(text)) return null;
      const nextLength = [...text].length;
      if (nextLength < min || nextLength > max) return null;
      if (!normalize(text).includes(normalize(brief.query))) return null;
      if (descriptionOpensWithQuotedQuery(text, brief.query)) return null;
      return { ...current, description: text };
    }, articleDescription);
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
    }, seoTitle);
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
    }, item.answer);
  }
  if (failure.code === "faq-specialist") return faqQuestionFragment(brief, fields, failure);
  if ((failure.code === "unique" || failure.code === "unique-pack") && (failure.field === "faq" || String(failure.path ?? "").includes("faq["))) {
    return faqQuestionFragment(brief, fields, failure);
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
    }, transition);
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
    }, fields.experts[index].thesis ?? "");
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
    }, found.text);
  }
  if (failure.code === "links-anchor" || (failure.code === "links-contextual" && (failure.actual ?? 0) < (failure.min ?? limits.contextualLinks[0]))) {
    return linkFragment(brief, fields, failure);
  }
  if (failure.code === "story-retell") return storyRetellFragment(brief, fields, failure);
  if (failure.code === "extra-query") return extraQueryFragment(brief, fields, failure);
  if (failure.code === "faq-answer-type") return faqAnswerFragment(brief, fields, failure);
  if (failure.code === "query-count" && (failure.actual ?? failure.queryCount ?? 0) > (failure.max ?? limits.mainQuery[1])) {
    const found = findSurplusSlot(fields, brief.query, brief.title);
    if (!found?.path) return null;
    const min = failure.min ?? limits.mainQuery[0];
    const max = failure.max ?? limits.mainQuery[1];
    const actual = Number.isFinite(failure.actual) ? failure.actual : failure.queryCount;
    const job = fragment(brief, `query-count:${found.path}`, [
      `В этом абзаце запрос «${brief.query}» стоит дословно. В статье он встречается ${actual} раз, нужно ${min}–${max}.`,
      `Перепиши абзац без дословной фразы «${brief.query}». Остальные абзацы статьи не меняй и не копируй.`,
      `Общее число вхождений не должно стать меньше ${min}. Не добавляй ссылок и шаблонных предложений.`,
      "Верни JSON { text } – только этот абзац.",
      "",
      found.text,
    ].join("\n"), objectSchema({ text: stringSchema }), (current, answer) => {
      const text = answer?.text;
      if (typeof text !== "string" || fieldProseDefect(text, found.path) || danglingFragment(text)) return null;
      if (boltedQuerySentence(text, brief.query)) return null;
      const oldHits = queryHits(found.text, brief.query);
      const newHits = queryHits(text, brief.query);
      if (newHits >= oldHits) return null;
      const nextCount = actual - oldHits + newHits;
      if (nextCount < min) return null;
      return setPath(current, found.path, text);
    }, found.text);
    job.outputTokens = 320;
    return job;
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
      const job = fragment(brief, `${failure.code}:${target.path}`, [
        `Шаг «${target.title}» сейчас ${target.words} слов. ${scope} ${failure.actual} слов, нужно минимум ${failure.min}, цель ${goal}.`,
        `Допиши в конец этого шага примерно ${need} слов. Уже написанное не переписывай и не присылай. Ссылок не добавляй.`,
        "Верни JSON { addition } – только новые предложения.",
        "",
        target.text,
      ].join("\n"), objectSchema({ addition: stringSchema }), (current, answer) => {
        const text = String(answer?.addition ?? "").trim();
        if (!text || fieldProseDefect(text, "steps.text")) return null;
        if (words(text) < 8 || words(text) > 400) return null;
        const steps = structuredClone(current.steps);
        const previous = steps.items[target.index].text ?? "";
        steps.items[target.index] = { ...steps.items[target.index], text: `${previous.trim()} ${text}`.trim() };
        return { ...current, steps };
      });
      job.outputTokens = lengthFragmentTokens(need);
      return job;
    }
    const job = fragment(brief, `${failure.code}:${target.path}`, [
      `Раздел «${target.title}» сейчас ${target.words} слов. ${scope} ${failure.actual} слов, нужно минимум ${failure.min}, цель ${goal}.`,
      `Добавь 1–2 новых абзаца примерно на ${need} слов. Уже написанные абзацы не переписывай и не присылай. Ссылок не добавляй.`,
      "Верни JSON { paragraphs } – только новые абзацы.",
      "",
      ...target.paragraphs,
    ].join("\n"), objectSchema({ paragraphs: { type: "array", maxItems: 2, items: stringSchema } }), (current, answer) => {
      const paragraphs = answer?.paragraphs;
      if (!Array.isArray(paragraphs) || !paragraphs.length || paragraphs.length > 2) return null;
      if (paragraphs.some((paragraph) => typeof paragraph !== "string" || fieldProseDefect(paragraph, "paragraph"))) return null;
      if (paragraphs.some((paragraph) => words(paragraph) > 400)) return null;
      const sections = structuredClone(current[target.key]);
      const kept = sections[target.index].paragraphs ?? [];
      sections[target.index] = { ...sections[target.index], paragraphs: [...kept, ...paragraphs] };
      return { ...current, [target.key]: sections };
    });
    job.outputTokens = lengthFragmentTokens(need);
    return job;
  }
  if (failure.code === "summoning" || failure.code === "forbidden" || failure.code === "mixed-script") {
    const spec = phraseSpec(failure);
    const banned = spec.phrase ?? "";
    const pattern = spec.kind === "regex"
      ? new RegExp(spec.source, spec.flags)
      : new RegExp(banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu");
    const direct = typeof failure.path === "string" ? getPath(fields, failure.path) : undefined;
    const found = typeof direct === "string" && textHasPhrase(direct, spec)
      ? { path: failure.path, text: direct }
      : findString(fields, pattern);
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
    }, found.text);
  }
  return null;
}

const PRIORITY = ["mixed-script", "em-dash", "links-internal", "description-length", "description-fragment", "seoTitle-length", "seoTitle-query", "transition-query", "story-length", "expert-thesis", "faq-length", "faq-fragment", "faq-answer-type", "faq-specialist", "links-anchor", "links-contextual", "count-mismatch", "query-count", "extra-query", "story-retell", "body-length", "total-length", "body-sections", "summoning", "forbidden", "unique", "unique-pack"];

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

/** Worst case of each still-open strong fragment that has a repair path, priced as the call itself. */
function strongFragmentPlan(repair, brief, fields, failures, strongTries, model) {
  const plan = [];
  for (const failure of failures) {
    if ((strongTries.get(failureKey(failure)) ?? 0) >= 1) continue;
    const job = buildSzFragment(brief, fields, failure);
    if (!job) continue;
    const cap = Math.min(job.outputTokens ?? repair.strongMaxTokens, repair.strongMaxTokens);
    const tokens = estimatePromptTokens(job.messages, model);
    plan.push({ key: failureKey(failure), cap, worst: worstCaseRub(model, tokens, cap) });
  }
  return plan;
}

function bindInstancePath(fields, failure) {
  if (failure.code === "extra-query") {
    const phrase = String(failure.message ?? "").match(/дополнительный запрос «([^»]+)»/)?.[1] ?? "";
    return phrase ? { ...failure, path: `extra:${phrase}` } : failure;
  }
  if (failure.code === "faq-answer-type") {
    const question = String(failure.message ?? "").match(/ответ на «([\s\S]+)» начинается/)?.[1] ?? "";
    const index = (fields.faq ?? []).findIndex((item) => item.question === question);
    return index >= 0 ? { ...failure, path: `faq[${index}].answer` } : failure;
  }
  if (failure.code === "story-retell") {
    const target = retellTarget(fields, failure);
    return target ? { ...failure, path: `${target.key}[${target.index}]` } : failure;
  }
  if (failure.code === "links-anchor") {
    const slug = String(failure.message ?? "").match(/\/s\/([a-z0-9-]+)/)?.[1] ?? "";
    const anchor = String(failure.message ?? "").match(/анкор «([^»]+)»/)?.[1] ?? "";
    const index = String(failure.message ?? "").match(/#(\d+)/)?.[1] ?? "0";
    return { ...failure, path: `anchor:${slug}:${index}`, slug, anchor };
  }
  if (failure.code === "count-mismatch") return { ...failure, path: failure.field ?? "count" };
  return failure;
}

/** One gate row per missing slug or per phrase, so a rejected candidate does not spend the next try. */
function bindQualityPaths(fields, brief, failures) {
  const out = [];
  for (const failure of failures) {
    if (failure.code === "links-contextual" && (failure.actual ?? 0) < (failure.min ?? SZ.limits.contextualLinks[0])) {
      const have = new Set(markdownSlugs(fields));
      const missing = (brief.links?.contextual ?? []).filter((slug) => /^[a-z0-9-]+$/.test(slug) && !have.has(slug));
      const need = Math.max(1, (failure.min ?? SZ.limits.contextualLinks[0]) - (failure.actual ?? have.size));
      const take = missing.slice(0, need);
      if (!take.length) {
        out.push(failure);
        continue;
      }
      for (const slug of take) out.push({ ...failure, path: `slug:${slug}`, slug });
      continue;
    }
    out.push(bindInstancePath(fields, failure));
  }
  return out;
}

/**
 * Repair until checkSzArticle is clean, or until every fragment has used its cheap
 * tries and one strong try. callTier(tier, name, messages, schema, { maxTokens }) performs the model call.
 * A truncated cheap call is retried once with a larger cap and still counts as one try.
 */
export function repairSzArticleTiered({ brief, raw, build, repair, callTier, state = { spentRub: 0, calls: [], warnings: [] }, args = {}, callIds = new Set(), unique = null }) {
  const errorsOf = (result) => result.problems.filter((problem) => problem.severity === "error");
  const settle = (value) => {
    const deterministic = applyDeterministicSzFixes(value, { query: brief.query, links: brief.links });
    const next = deterministic.fields;
    return { fields: next, result: build(next), fixes: [...deterministic.fixes] };
  };
  const errorsBeforeRepair = errorsOf(build(raw));
  const settled = settle(raw);
  let fields = settled.fields;
  let result = settled.result;
  const deterministic = { fixes: settled.fixes };
  const attempts = [];
  const cheapTries = new Map();
  const strongTries = new Map();
  const descriptionDrafts = new Map();
  const allowModel = !args.offline && !args["no-repair"];
  const maxRounds = repair.maxRounds ?? 12;
  for (let round = 0; round < maxRounds && allowModel && errorsOf(result).length; round += 1) {
    const failures = bindQualityPaths(fields, brief, locatePhraseFailures(fields, szQuantityReport(fields, errorsOf(result)).failures));
    const failure = pickFailure(failures, cheapTries, strongTries, repair.cheapTries);
    if (!failure) break;
    const queryCount = bodyQueryCount(result.md, brief.query);
    for (const item of failures) item.queryCount = queryCount;
    failure.queryCount = queryCount;
    const key = failureKey(failure);
    if ((failure.code === "description-length" || failure.code === "description-fragment") && descriptionDrafts.has(key)) {
      failure.descriptionDraft = descriptionDrafts.get(key).text;
    }
    if (failure.code === "unique" || failure.code === "unique-pack" || failure.code === "faq-specialist") {
      const occupied = new Set();
      for (const [norm, slug] of unique?.questions ?? []) {
        if (slug !== brief.slug) occupied.add(norm);
      }
      failure.occupiedQuestions = occupied;
    }
    const fragmentJob = buildSzFragment(brief, fields, failure);
    if (!fragmentJob) {
      cheapTries.set(key, repair.cheapTries);
      strongTries.set(key, 1);
      continue;
    }
    const tier = (cheapTries.get(key) ?? 0) >= repair.cheapTries ? "strong" : "cheap";
    const model = tier === "strong" ? repair.strongModel : repair.cheapModel;
    const configured = tier === "strong" ? repair.strongMaxTokens : repair.cheapMaxTokens;
    const budget = tier === "strong" ? repair.strongBudget : repair.cheapBudget;
    const promptTokens = estimatePromptTokens(fragmentJob.messages, model);
    let maxTokens = tier === "strong" ? configured : cheapTokenCap({ model, fragmentKey: fragmentJob.key, configured });
    let peerReserve = 0;
    if (tier === "strong") {
      const room = budget - tierSpent(attempts, "strong");
      const plan = strongFragmentPlan(repair, brief, fields, failures, strongTries, model);
      for (const item of plan) {
        if (item.worst <= budget + 1e-9) continue;
        if ((strongTries.get(item.key) ?? 0) >= 1) continue;
        strongTries.set(item.key, 1);
        state.warnings.push(`${brief.slug}: ярус strong остановлен бюджетом ${budget} ₽: худший случай ${item.key} один не помещается, остальные ошибки не блокируются`);
      }
      const mine = plan.find((item) => item.key === key);
      if (!mine || mine.worst > budget + 1e-9) {
        strongTries.set(key, 1);
        continue;
      }
      if (mine.worst > room + 1e-9) {
        strongTries.set(key, 1);
        state.warnings.push(`${brief.slug}: ярус strong остановлен бюджетом ${budget} ₽: худший случай ${key} не помещается в оставшийся бюджет`);
        continue;
      }
      // A truncated retry still leaves room for each other fixable error. The sum does not gate this call.
      peerReserve = plan.filter((item) => item.key !== key && item.worst <= budget + 1e-9).reduce((sum, item) => sum + item.worst, 0);
      maxTokens = mine.cap;
    }
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
      const room = budget - tierSpent(attempts, tier) - (tier === "strong" ? peerReserve : 0);
      if (spentNow + retryWorst <= room + 1e-9) {
        try {
          second = invokeFragment({ tier, slug: brief.slug, attempt: `${attempt}-retry`, fragmentJob, callTier, state, callIds, maxTokens: retryCap });
        } catch (error) {
          if (!(error instanceof BudgetError) && error?.code !== 5) throw error;
          state.warnings.push(`${brief.slug}: повтор яруса ${tier} остановлен общим бюджетом`);
        }
      }
    }
    const noteDescription = (answer) => {
      if (failure.code !== "description-length" && failure.code !== "description-fragment") return;
      rememberDescription(descriptionDrafts, key, descriptionCandidate(answer, brief, fields));
    };
    noteDescription(first?.answer);
    noteDescription(second?.answer);
    let merged = acceptFragment(fragmentJob, fields, first, second);
    if (!merged && tier === "cheap" && descriptionDrafts.has(key) && (failure.code === "description-length" || failure.code === "description-fragment")) {
      const tightenJob = buildSzFragment(brief, fields, { ...failure, descriptionDraft: descriptionDrafts.get(key).text });
      const spentNow = (state.spentRub ?? 0) - before;
      const tightenWorst = tightenJob ? worstCaseRub(model, estimatePromptTokens(tightenJob.messages, model), maxTokens) : Infinity;
      const cheapRoom = budget - tierSpent(attempts, tier);
      if (tightenJob && spentNow + tightenWorst <= cheapRoom + 1e-9) {
        try {
          const tighten = invokeFragment({
            tier, slug: brief.slug, attempt: `${attempt}-tighten`, fragmentJob: tightenJob, callTier, state, callIds, maxTokens,
          });
          noteDescription(tighten.answer);
          const rewritten = tightenJob.apply(fields, tighten.answer);
          if (rewritten) merged = rewritten;
        } catch (error) {
          if (!(error instanceof BudgetError) && error?.code !== 5) throw error;
          state.warnings.push(`${brief.slug}: уточнение длины description остановлено общим бюджетом`);
        }
      }
    }
    const costRub = (state.spentRub ?? 0) - before;
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

