// sergey-zoya.ru article rules – ONE source for the writer's validator and the generated stage gate.
// Self-contained on purpose (no imports): apply.mjs copies this file's text into
// scripts/check-stageNN-articles.mjs of the site, so the site checks exactly what «Райтер» checked.
// Rules = check-stage24-articles.mjs (sz, angel-hranitel) + editorial lessons from the angel edits
// (EDITS.md) + Sergey's rules: no outgoing links to other websites (internal /s/ and
// cross-links of audiolad.ru and sergey-zoya.ru only; a bare domain or e-mail counts too), en dash only,
// practice is described only positively (no discomfort priming), MAX only via the default funnel label.
// Each problem: { code, field, message, severity: "error" | "warn" }. Warnings never fail the gate.

export const SZ_RULES_VERSION = 1;

export const words = (text) => String(text).match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
export const normalize = (text) => String(text).trim().replace(/,/g, "").replace(/\s+/g, " ").toLocaleLowerCase("ru").replace(/ё/g, "е");
// A copied or lightly edited paragraph. 0.9 on similar-length word sets; the approved angel article stays under it.
export const PARAGRAPH_SIMILARITY = 0.9;
const PARAGRAPH_MIN_WORDS = 8;

export function paragraphTokens(text) {
  return normalize(text).replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim().split(" ").filter((token) => token.length >= 2);
}

/** 1 when the paragraphs are the same after normalization, else token Jaccard. Short lines stay at 0. */
export function paragraphSimilarity(a, b) {
  const left = paragraphTokens(a);
  const right = paragraphTokens(b);
  if (left.length < PARAGRAPH_MIN_WORDS || right.length < PARAGRAPH_MIN_WORDS) return 0;
  if (left.join(" ") === right.join(" ")) return 1;
  const shorter = Math.min(left.length, right.length);
  const longer = Math.max(left.length, right.length);
  if (shorter / longer < 0.75) return 0;
  const aSet = new Set(left);
  const bSet = new Set(right);
  let shared = 0;
  for (const token of aSet) if (bSet.has(token)) shared += 1;
  const union = aSet.size + bSet.size - shared;
  return union ? shared / union : 0;
}

export function paragraphsTooClose(a, b) {
  return paragraphSimilarity(a, b) >= PARAGRAPH_SIMILARITY;
}

/** The one FAQ question that must stay about seeing a specialist. */
export function isSpecialistQuestion(question) {
  return /специалист|психолог|обратиться/iu.test(String(question ?? ""));
}

const GENERIC_LINK_ANCHORS = new Set(["материал", "здесь", "подробнее", "тут", "ссылка", "статья", "статье", "читать", "далее", "этом"]);
/** Anchor is only a generic pointer («материал», «здесь», «подробнее»), not a description of the article. */
export function genericLinkAnchor(anchor) {
  const tokens = paragraphTokens(anchor).filter((token) => token.length >= 3);
  if (!tokens.length) return true;
  return tokens.every((token) => GENERIC_LINK_ANCHORS.has(token));
}

const LINK_LEAD = String.raw`Подробнее|Читайте также|Читайте ещё|Смотрите также|Подробности`;

/** Orphan link glue: «Подробнее: .», empty [](), a colon before a closing quote. A real [анкор](/s/…) is not residue. */
export function linkLeadResidue(text) {
  const raw = String(text ?? "");
  const hits = [];
  const lead = new RegExp(`(?:${LINK_LEAD})\\s*:(?!\\s*\\[[^\\]\\n]+\\]\\([^)\\n]+\\))`, "giu");
  for (const match of raw.matchAll(lead)) hits.push(match[0].trim());
  for (const match of raw.matchAll(/(?<!!)\[\s*\]\([^)]*\)/g)) hits.push(match[0]);
  for (const match of raw.matchAll(/:\s*\.(?=\s|$|[»”’"])/gu)) hits.push(match[0]);
  for (const match of raw.matchAll(/:\s*[»”’"]/gu)) hits.push(match[0]);
  return hits;
}

const RETELL_STOP = new Set(["ангел", "ангела", "ангелу", "ангеле", "хранитель", "хранителя", "хранителю", "молитва", "молитвы", "молитву", "молитве", "образ", "образа", "человек", "человека", "можно", "когда", "этот", "этой", "этого", "только", "после", "перед", "через", "чтобы", "который", "которая", "которые", "практика", "практике", "также", "будет", "были", "было", "очень", "просто", "потом", "тогда", "здесь", "свой", "свою", "свои"]);
const RETELL_NAMES = new Set(["ангел", "ангела", "ангелу", "ангеле", "ангелом", "божий", "бога", "бог", "христос", "христа", "христов", "святый", "аминь", "господь", "господа", "крещении", "православного", "эзотерика", "ченнелинг", "молитвы", "хранителю", "молитва"]);

function retellTokens(text) {
  return paragraphTokens(text).filter((token) => token.length >= 5 && !RETELL_STOP.has(token));
}

function retellShards(tokens) {
  const grams = [];
  for (let i = 0; i < tokens.length - 1; i += 1) grams.push(`${tokens[i]} ${tokens[i + 1]}`);
  return grams;
}

function properNames(text) {
  const found = new Set();
  for (const match of String(text).matchAll(/[А-ЯЁ][а-яё]{3,}/g)) {
    const name = normalize(match[0]);
    if (name.length < 4 || RETELL_NAMES.has(name)) continue;
    found.add(name);
  }
  return found;
}

/**
 * A later section retells the opening story: many of the same content tokens,
 * the same word pairs (shards), or a named character plus a smaller overlap.
 * The approved angel article stays under every threshold.
 */
export function sectionRetellsStory(story, section) {
  const left = retellTokens(story);
  const right = retellTokens(section);
  const a = new Set(left);
  const b = new Set(right);
  if (a.size < 12 || b.size < 12) return false;
  const shared = [...a].filter((token) => b.has(token));
  const ratio = shared.length / Math.min(a.size, b.size);
  const leftShards = new Set(retellShards(left));
  const rightShards = new Set(retellShards(right));
  let sharedShards = 0;
  for (const gram of leftShards) if (rightShards.has(gram)) sharedShards += 1;
  const shardRatio = leftShards.size && rightShards.size ? sharedShards / Math.min(leftShards.size, rightShards.size) : 0;
  const names = [...properNames(story)].filter((name) => properNames(section).has(name));
  if (shared.length >= 8 && ratio >= 0.28) return true;
  if (sharedShards >= 5 && shardRatio >= 0.18) return true;
  if (names.length && shared.length >= 6 && ratio >= 0.15) return true;
  return false;
}

const LIST_COUNT_WORDS = [["один", 1], ["одна", 1], ["одно", 1], ["два", 2], ["две", 2], ["три", 3], ["четыре", 4], ["пять", 5], ["шесть", 6], ["семь", 7], ["восемь", 8], ["девять", 9], ["десять", 10]];

/** A heading that promises N steps/items, or null when it does not count a list. */
export function statedListCount(title) {
  const text = normalize(title);
  if (!/(шаг|пункт|признак)/.test(text)) return null;
  for (const [word, num] of LIST_COUNT_WORDS) {
    if (new RegExp(`(?:^|\\s)${word}(?=\\s)`).test(text)) return num;
  }
  const digit = text.match(/(?:^|\s)(\d{1,2})(?=\s)/);
  return digit ? Number(digit[1]) : null;
}

function listNoun(stem, count) {
  const forms = {
    шаг: ["шаг", "шага", "шагов"],
    пункт: ["пункт", "пункта", "пунктов"],
    признак: ["признак", "признака", "признаков"],
  }[stem];
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** Replace the count in a heading so it agrees with the list. Other words stay. */
export function alignListCount(title, count) {
  const stated = statedListCount(title);
  if (stated == null || stated === count || count < 1 || count > 10) return title;
  const stem = /пункт/iu.test(title) ? "пункт" : (/признак/iu.test(title) ? "признак" : "шаг");
  const noun = listNoun(stem, count);
  const word = LIST_COUNT_WORDS.find(([, num]) => num === count)?.[0] ?? String(count);
  return String(title).replace(
    /(\d{1,2}|[Оо]дин|[Оо]дна|[Оо]дно|[Дд]ва|[Дд]ве|[Тт]ри|[Чч]етыре|[Пп]ять|[Шш]есть|[Сс]емь|[Вв]осемь|[Дд]евять|[Дд]есять)(\s+)(шаг(?:а|ов)?|пункт(?:а|ов)?|признак(?:а|ов)?)/u,
    (full, num, space) => {
      const digit = /^\d/.test(num);
      const cap = !digit && num[0] !== num[0].toLocaleLowerCase("ru");
      const next = digit ? String(count) : (cap ? word[0].toLocaleUpperCase("ru") + word.slice(1) : word);
      return `${next}${space}${noun}`;
    },
  );
}

const NOT_LETTER = String.raw`(?![\p{L}\p{N}])`;
const YES_NO_QUESTION = new RegExp(String.raw`^(?:а\s+)?(?:можно|нужно|нужен|нужна|нужны|стоит|есть|был|была|будет|верно|правда|должен|должна|надо|возможно|обязательно)\s+ли${NOT_LETTER}`, "iu");
const OPEN_QUESTION = new RegExp(String.raw`^(?:а\s+)?(?:(?:с|со|о|об|на|в|во|для|от|по|при)\s+)?(?:как|почему|зачем|что|чем|какой|какая|какие|какое|какого|какую|каких|кто|кого|где|когда|откуда|куда|сколько|насколько)${NOT_LETTER}`, "iu");
const YES_NO_ANSWER = new RegExp(String.raw`^(?:да|нет|можно|нельзя|конечно|разумеется)${NOT_LETTER}`, "iu");

/** Open question («Как понять…») answered as yes/no («Да, …»). A question with «ли» may start with «Да». */
export function faqAnswerTypeMismatch(question, answer) {
  const ask = String(question ?? "").trim();
  const reply = String(answer ?? "").trim();
  if (!ask || !reply) return false;
  if (YES_NO_QUESTION.test(ask) || !OPEN_QUESTION.test(ask)) return false;
  return YES_NO_ANSWER.test(reply);
}

/** Description opened with the query in «ёлочки», including a lowercase query. */
export function descriptionOpensWithQuotedQuery(description, query) {
  const nq = normalize(query);
  if (!nq) return false;
  const match = String(description ?? "").match(/^«\s*([^»]+?)\s*»/u);
  return Boolean(match && normalize(match[1]) === nq);
}

// Same owner rule as findTextAddresses in lib/validate.mjs. This file cannot import it:
// the stage gate copies these rules verbatim. One allowlist for the gate, the fragment
// validator and the plain-text scanner.
const ALLOWED_SITE_HOSTS = ["audiolad.ru", "sergey-zoya.ru"];
// Real public suffixes only. File and runtime suffixes (.js, .jpg, .webp, …) are not TLDs,
// so «Node.js», «Vue.js», «Next.js» and «photo.jpg» are not addresses. «ASP.NET» uses a real TLD.
const KNOWN_TLDS = ["com", "org", "net", "ru", "su", "info", "biz", "pro", "name", "mobi", "app", "dev", "io", "ai", "co", "me", "uk", "ly", "cc", "tv", "xyz", "site", "online", "shop", "ua", "by", "kz", "eu", "de", "fr", "it", "es", "nl", "pl", "us", "ca", "au", "edu", "gov", "int", "fm", "to"];
const TECHNOLOGY_NAMES = new Set(["node.js", "vue.js", "next.js", "asp.net"]);
const TLD_PATTERN = [...KNOWN_TLDS].sort((a, b) => b.length - a.length).join("|");
// Cyrillic public suffixes. A dotted Russian word is an address only when the last label is one of these,
// so «в конце.Далее» and «т.е.» stay ordinary prose. Longer names first.
const IDN_TLDS = ["онлайн", "москва", "дети", "сайт", "рус", "рф"];
const IDN_TLD_PATTERN = [...IDN_TLDS].sort((a, b) => b.length - a.length).join("|");
const HOST_BOUNDARY = "(?<![\\p{L}\\d@._/-])";
const ASCII_HOST = `(?:www\\.)?(?:[a-z\\d][a-z\\d-]*\\.)+(?:${TLD_PATTERN})(?![\\p{L}\\d-])`;
const IDN_HOST = `(?:www\\.)?(?:[а-яё\\d][а-яё\\d-]*\\.)+(?:${IDN_TLD_PATTERN})(?![\\p{L}\\d-])`;
// A label xn-- is punycode (xn--80aswg.xn--p1ai, www.xn--80aswg.xn--p1ai), including when the last label is an ASCII TLD.
const PUNY_HOST = `(?:www\\.)?(?=[a-z0-9.-]*xn--)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:xn--[a-z0-9-]+|${TLD_PATTERN})(?![\\p{L}\\d-])`;
const PATH_TAIL = "(?:\\/[^\\s«»\"()<>]*)?";
const OUTGOING_ADDRESS_PATTERNS = [
  { name: "e-mail", re: /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.\p{L}{2,}/gu, always: true },
  { name: "ссылка mailto:/tel:", re: /\b(?:mailto|tel|sms|tg|whatsapp|viber|skype):[^\s«»"]*/giu, always: true },
  { name: "адрес сайта", re: /(?:https?:)?\/\/[^\s«»"()<>]+/giu },
  { name: "адрес сайта", re: new RegExp(`${HOST_BOUNDARY}${ASCII_HOST}${PATH_TAIL}`, "giu") },
  { name: "адрес сайта", re: new RegExp(`${HOST_BOUNDARY}${IDN_HOST}${PATH_TAIL}`, "giu") },
  { name: "адрес сайта", re: new RegExp(`${HOST_BOUNDARY}${PUNY_HOST}${PATH_TAIL}`, "giu") },
];
// Inside a path, query or fragment the token may follow /, ?, # or =. The plain-text lookbehind hides those.
const NESTED_HOST_SOURCES = [
  `(?:^|[^\\p{L}\\d@._-])${ASCII_HOST}`,
  `(?:^|[^\\p{L}\\d@._-])${IDN_HOST}`,
  `(?:^|[^\\p{L}\\d@._-])${PUNY_HOST}`,
];

function addressHost(raw) {
  const trimmed = String(raw ?? "").trim().replace(/[.,;:!?…]+$/u, "");
  let url = trimmed;
  if (trimmed.startsWith("//")) url = `https:${trimmed}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) url = `https://${trimmed}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostAllowed(host) {
  if (!host) return false;
  const bare = host.toLowerCase().replace(/^www\./, "");
  return ALLOWED_SITE_HOSTS.some((allowed) => bare === allowed || bare.endsWith(`.${allowed}`));
}

/** A bare technology token («Node.js», «Vue.js», «ASP.NET»), not a URL with a scheme or a path. */
function technologyMention(raw) {
  const trimmed = String(raw ?? "").trim().replace(/[.,;:!?…]+$/u, "");
  if (/[/:?#]/.test(trimmed) || /\s/u.test(trimmed)) return false;
  return TECHNOLOGY_NAMES.has(trimmed.toLowerCase());
}

/** Path, query and fragment of the original string. `new URL` would percent-encode «сайт.рф» before the scan. */
function rawAddressTail(raw) {
  const trimmed = String(raw ?? "").trim().replace(/[.,;:!?…]+$/u, "");
  const withScheme = trimmed.match(/^(?:[a-z][a-z0-9+.-]*:)?\/\/([^/?#\s]+)([\s\S]*)$/i);
  if (withScheme) return withScheme[2] ?? "";
  const bare = trimmed.match(/^[^\s/?#]+([/?#][\s\S]*)$/u);
  return bare?.[1] ?? "";
}

/**
 * The original tail, then the same text with percent-escapes turned into separators,
 * then up to two decodeURIComponent passes (evil%252Ecom → evil%2Ecom → evil.com).
 * Separators stop %2F from gluing into a fake label (2Fevil.com / 2Faudiolad.ru).
 */
function tailScanTexts(tail) {
  const texts = [];
  const add = (value) => {
    // %HH is not a host character. Replacing it before the scan keeps «сайт.рф» and «evil.com»
    // and stops «%2Fevil.com» from being read as the fake label 2fevil.com.
    const separated = value.replace(/%[0-9a-f]{2}/gi, "/");
    if (!texts.includes(separated)) texts.push(separated);
  };
  let current = String(tail ?? "");
  add(current);
  for (let pass = 0; pass < 2; pass += 1) {
    if (!/%[0-9a-f]{2}/i.test(current)) break;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
      add(current);
    } catch {
      break;
    }
  }
  return texts;
}

/** A host token inside a tail. Technology names are not exempt here: asp.net in a path is still a domain. */
function nestedHostDisallowed(raw, seen) {
  const key = String(raw ?? "");
  if (seen.has(key)) return true;
  const next = new Set(seen);
  next.add(key);
  const host = addressHost(key);
  if (!host || !hostAllowed(host)) return true;
  return tailHasDisallowedAddress(key, next);
}

function textHasDisallowedTail(text, seen) {
  for (const pattern of OUTGOING_ADDRESS_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    for (const match of text.matchAll(re)) {
      const nested = match[0].replace(/^[^\p{L}\d]+/u, "").replace(/[.,;:!?…]+$/u, "");
      if (!nested) continue;
      if (pattern.always || nestedHostDisallowed(nested, seen)) return true;
    }
  }
  for (const source of NESTED_HOST_SOURCES) {
    const re = new RegExp(source, "giu");
    for (const match of text.matchAll(re)) {
      const nested = match[0].replace(/^[^\p{L}\d]+/u, "").replace(/[.,;:!?…]+$/u, "");
      if (nested && nestedHostDisallowed(nested, seen)) return true;
    }
  }
  return false;
}

/** True when the raw path, query or fragment hides another site, a bare domain or an e-mail. */
function tailHasDisallowedAddress(raw, seen) {
  const tail = rawAddressTail(raw);
  if (!tail || tail === "/") return false;
  return tailScanTexts(tail).some((text) => textHasDisallowedTail(text, seen));
}

function addressDisallowed(raw, seen = new Set()) {
  const key = String(raw ?? "");
  if (seen.has(key)) return true;
  if (technologyMention(key)) return false;
  const next = new Set(seen);
  next.add(key);
  const host = addressHost(key);
  if (!hostAllowed(host)) return true;
  return tailHasDisallowedAddress(key, next);
}

/**
 * http(s) and protocol-relative addresses of audiolad.ru and sergey-zoya.ru,
 * including www and other subdomains. The raw path, query and fragment, and the
 * same text percent-decoded up to twice, may not hide another host
 * (https://audiolad.ru/сайт.рф, ?u=сайт.рф, #сайт.рф, /path/evil%2Ecom).
 * audiolad.ru and sergey-zoya.ru inside that tail stay allowed.
 */
export function allowedSiteAddress(value) {
  if (technologyMention(value)) return false;
  return !addressDisallowed(value);
}

/**
 * Bare domains (example.com/candle, t.me/x, www.example.com, сайт.рф, www.сайт.рф,
 * пример.москва, xn--80aswg.xn--p1ai), //host, http(s)://, mailto:/tel: and e-mails.
 * audiolad.ru and sergey-zoya.ru, with www and subdomains, are allowed.
 * E-mail is never allowed. «т.е.», «т.д.», initials, decimals, «в конце.Далее»,
 * Node.js / Vue.js / Next.js, ASP.NET and file names such as photo.jpg do not match.
 */
export function outgoingAddressProblems(text) {
  const problems = [];
  const taken = [];
  const source = String(text ?? "");
  for (const pattern of OUTGOING_ADDRESS_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    for (const match of source.matchAll(re)) {
      const start = match.index;
      const end = start + match[0].length;
      if (taken.some(([from, to]) => start < to && end > from)) continue;
      const raw = match[0].replace(/[.,;:!?…]+$/u, "");
      if (technologyMention(raw)) continue;
      taken.push([start, end]);
      if (!pattern.always && allowedSiteAddress(raw)) continue;
      problems.push(`${pattern.name} в тексте: ${raw.slice(0, 80)}`);
    }
  }
  return problems;
}

export const quoteText = (text) => String(text).replace(/[«»"“”„]/g, "").replace(/[—–-]/g, "–").replace(/\s+/g, " ").trim();
// Assembler placeholder. A thesis of «а» or «главная мысль а» is the same failure as the exact phrase.
export const EXPERT_PLACEHOLDER_THESIS = "главная мысль";
const INVISIBLE = /[\u200B\u200C\u200D\uFEFF\u2060\u00AD]/g;
export const stripInvisible = (text) => String(text ?? "").replace(INVISIBLE, "");
const WORD = /[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu;
// What a reader still sees after sz normalization: no invisible chars, no markdown bold,
// no heading the assembler strips («Чем закончилась история.»).
export function visibleProse(text) {
  return stripInvisible(text).replace(/\*\*/g, "").replace(/^Чем закончилась история\.?\s*/u, "").trim();
}
function meaningfulWords(text) {
  return (visibleProse(text).match(WORD) ?? []).filter((token) => (token.match(/\p{L}/gu) ?? []).length >= 2);
}
// A sentence counts only when it has two real words. «А.» and «Б.» do not.
function sentenceCount(text) {
  return visibleProse(text).split(/[.!?…]+/u).filter((part) => meaningfulWords(part).length >= 2).length;
}
/** Minimum for any model string. Names and table cells stay short; prose does not. */
export function proseLimit(path) {
  const parts = String(path).replace(/\[\d+\]/g, "").split(".").filter(Boolean);
  const key = parts.at(-1) ?? "";
  const parent = parts.at(-2) ?? "";
  if (key === "name") return { minWords: 1, minSentences: 0 };
  if (key === "thesis") return { minWords: 3, minSentences: 0 };
  if (key === "bridge" || key === "storyEnding") return { minWords: 8, minSentences: 2 };
  if (key === "columns" || key === "rows") return { minWords: 1, minSentences: 0 };
  if (key === "title" || key === "seoTitle" || key === "faqHeading") return { minWords: 2, minSentences: 0 };
  // «Наденьте наушники.» is a real imperative (2 words). «а», «б» and «главная мысль» still fail.
  if (key === "items" && parent === "checklist") return { minWords: 2, minSentences: 0 };
  if (key === "question" || key === "finalQuestion" || (key === "items" && parent === "specialist") || key.startsWith("feedback")) return { minWords: 3, minSentences: 0 };
  return { minWords: 4, minSentences: 0 };
}
/** Null when the text is still substantive after normalization. */
export function proseDefect(text, spec = proseLimit("paragraph")) {
  const count = meaningfulWords(text).length;
  if (count < spec.minWords) return `после нормализации ${count} содержательных слов, нужно ≥ ${spec.minWords}`;
  if (spec.minSentences) {
    const sentences = sentenceCount(text);
    if (sentences < spec.minSentences) return `после нормализации ${sentences} предложений, нужно ≥ ${spec.minSentences}`;
  }
  const plain = visibleProse(text).replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("ru").replace(/ё/g, "е");
  if (plain.includes(EXPERT_PLACEHOLDER_THESIS)) {
    const rest = plain.replaceAll(EXPERT_PLACEHOLDER_THESIS, " ").replace(/\s+/g, " ").trim();
    const restCount = meaningfulWords(rest).length;
    if (restCount < spec.minWords) return "заглушка «главная мысль» или текст, который от неё почти не отличается";
  }
  return null;
}

// A cut such as «…чудес. Это не» is still inside the length window, so length alone
// used to accept it. Descriptions and FAQ answers must end on a finished sentence.
const DANGLING_CLAUSE = /(?:^|\s)(?:это\s+)?не$/iu;
export function danglingFragment(text) {
  const visible = visibleProse(text).replace(/\s+/g, " ").trim();
  if (!visible) return "пустой текст";
  const bare = visible.replace(/[»"”']+$/u, "");
  if (!/[.!?…]$/u.test(bare)) return "нет конца предложения";
  const last = bare.split(/(?<=[.!?…])\s+/u).at(-1) ?? bare;
  const clause = last.replace(/[.!?…]+$/u, "").trim();
  if (meaningfulWords(clause).length < 2) return "последнее предложение оборвано";
  if (DANGLING_CLAUSE.test(clause)) return "обрывается на «не»";
  return null;
}

// Drop one :::block through the line that closes it. A following :::name must stay,
// including an empty block (`:::overview\n:::`).
function stripDirectives(text) {
  const kept = [];
  let inside = false;
  for (const line of text.split("\n")) {
    if (!inside && line.startsWith(":::")) {
      inside = true;
      continue;
    }
    if (inside) {
      if (line.trim() === ":::") inside = false;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

// Every visible block, not only the fields a reviewer happened to name.
function auditHollowProse(body, add) {
  const plain = stripDirectives(body
    .replace(/<section[\s\S]*?<\/section>/g, "\n")
    .replace(/<p class="article-disclaimer">[\s\S]*?<\/p>/g, "\n"));
  for (const row of plain.matchAll(/^\|(.+)\|$/gm)) {
    if (/^[\s|:-]+$/.test(row[1])) continue;
    for (const cell of row[1].split("|")) {
      const text = cell.trim();
      if (!text || /^:?-+:?$/.test(text)) continue;
      const defect = proseDefect(text, proseLimit("tableSection.columns"));
      if (defect) add("thin-prose", "tableSection", defect);
    }
  }
  for (const paragraph of plain.replace(/^\|.*$/gm, "").split(/\n\n+/)) {
    const block = paragraph.trim();
    if (!block || block.startsWith("<") || block.startsWith(":::") || block.startsWith("**Чем закончилась история.")) continue;
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const pieces = lines.every((line) => line.startsWith("- ")) ? lines : [block];
    for (const text of pieces) {
      if (/^#{1,3}\s/.test(text)) {
        const defect = proseDefect(text.replace(/^#+\s*/, ""), proseLimit("title"));
        if (defect) add("thin-prose", "sections", defect);
      } else if (text.startsWith("- ")) {
        const defect = proseDefect(text.replace(/^- /, ""), proseLimit("specialist.items"));
        if (defect) add("thin-prose", "specialist", defect);
      } else if (/^\*\*[^*\n]+\?\*\*$/.test(text)) {
        const defect = proseDefect(text, proseLimit("question"));
        if (defect) add("thin-prose", "question", defect);
      } else {
        const defect = proseDefect(text, proseLimit("paragraph"));
        if (defect) add("thin-prose", "sections", defect);
      }
    }
  }
}

export function fieldProseDefect(value, path = "") {
  if (typeof value === "string") {
    const defect = proseDefect(value, proseLimit(path));
    return defect ? `${path}: ${defect}` : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const defect = fieldProseDefect(value[i], `${path}[${i}]`);
      if (defect) return defect;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const defect = fieldProseDefect(item, path ? `${path}.${key}` : key);
      if (defect) return defect;
    }
  }
  return null;
}
const sharedHeading = (text) => /^(?:Частые вопросы|Читайте также$|Когда стоит обратиться к специалисту$)/iu.test(text);

// Healing/outcome promise guard (stage 11/24). JS `\b` is ASCII-only → Unicode lookahead.
const END = "(?![\\p{L}\\p{N}_])";
export const PROMISE = new RegExp(`(?<!не )гарантиру(?:ет|ют|ем)${END}|исцел(?:ит|яет|ят|яют)${END}|выле(?:чит|чат|чивает|чивают)${END}|излеч(?:ит|ат|ивает|ивают)${END}|раскро(?:ет|ют) (?:все )?чакры за|100\\s?%`, "iu");
export const FICTION = /художественн|собран[аы]? из типичных|истори[яи]\s+(?:является\s+)?(?:вымышлен|выдуман|собирательн)|имена изменен|совпадени[яе] случайн/iu;
// Mirror of the site's check-no-visible-dates (Sergey: readers never see a date) – pack 04 lesson.
const MONTHS = "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря";
export const VISIBLE_DATE = new RegExp(`Обновлено|Опубликовано|<time\\b|\\b\\d{1,2}\\s+(?:${MONTHS})(?:\\s+\\d{4})?|\\b(?:19|20)\\d{2}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}\\.\\d{1,2}\\.(?:19|20)\\d{2}\\b`, "iu");
// A Latin letter glued to Cyrillic inside one word («Тension», «taro-на-dengi») – model artefact.
export const MIXED_SCRIPT = /[а-яё][a-z]|[a-z][а-яё]/iu;
// Review #72: unsupported appeals to research (no study in the brief) – «Психологи объясняют…» instead.
export const UNSUPPORTED_SCIENCE = /(?:научные\s+)?исследования\s+(?:показывают|доказ[а-яё]*|подтвержда[а-яё]*)|учёные\s+(?:доказали|выяснили|установили)|наука\s+доказ[а-яё]*/iu;
export const SUMMONING = /призыв(?!а»)|оберег|защит(?:ит|ят|у от)/iu;
export const ZOYA_PSYCHOLOGIST = /Зоя Петрова[^\n]{0,40}психолог|психолог Зоя/iu;
// Mirror of scripts/writer/validate.mjs DISCOMFORT_PATTERNS (PR #964, Sergey 2026-10-23): a practice is
// described only positively – no priming with discomfort or advice to stop the recording.
export const DISCOMFORT_PATTERNS = [
  { name: "дискомфорт", re: /дискомфорт|некомфортн/iu },
  { name: "неприятные ощущения", re: /неприятн[а-яё]*\s+ощущени/iu },
  { name: "остановить/прекратить запись", re: /(?:останов|прекра[тщ]|прерв|приостанов)[а-яё]*\s+(?:[а-яё]+\s+)?(?:запис|прослушивани|аудио|практик|медитаци|упражнени|сеанс)[а-яё]*/iu },
  { name: "запись следует остановить", re: /(?:запис|прослушивани|аудио|практик|медитаци|упражнени)[а-яё]*\s+(?:можно|нужно|следует|лучше|стоит|надо|необходимо)\s+(?:[а-яё]+\s+)?(?:останов|прекрат|прерв)[а-яё]*/iu },
  { name: "если станет плохо", re: /если\s+(?:вам\s+)?(?:станет|стало|становится)\s+(?:плохо|хуже|страшно|тревожно|не по себе)/iu },
];
// Mirror of sergey-zoya-site scripts/check-no-discomfort-priming.mjs (#70): sentence-level, gated
// by a practice/recording context word – so the writer never produces what the site test rejects.
export const SITE_DISCOMFORT_CONTEXT = /практик|медитац|прослуш|запис|аудио|слушат|упражнен/i;
export const SITE_DISCOMFORT = [
  /дискомфорт/i,
  /неприятн\S* ощущени/i,
  /останов\S* (запись|аудио|прослушивание|практику|звук)/i,
  /(запись|прослушивание|практику) (следует|нужно|можно) (остановить|прекратить|прервать)/i,
  /прекраща\S* прослушивание/i,
  /если (станет|стало) (плохо|хуже|страшно)/i,
  /(во время|после) (практик\S*|медитаци\S*|прослушивани\S*|записи)[^.]{0,40}(паник|тревог|головокруж)/i,
  /(практик\S*|медитаци\S*|упражнени\S*|запись) (вызыва\S*|усилива\S*) (тревог|паник|страх|дискомфорт)/i,
];
export function siteDiscomfortHits(md) {
  const hits = [];
  md.split("\n").forEach((line) => {
    for (const sentence of line.split(/(?<=[.!?»"])\s+/)) {
      if (!SITE_DISCOMFORT_CONTEXT.test(sentence)) continue;
      const hit = SITE_DISCOMFORT.find((pattern) => pattern.test(sentence));
      if (hit) hits.push(sentence.trim().slice(0, 120));
    }
  });
  return hits;
}
// Pack 04 lessons (453eaa2a): signs, numbers, colours, runes, mirrors do not predict or «come true»;
// no promises of luck or money.
export const PREDICTION = /(?<!не )(?:предсказыва(?:ет|ют)|предскаж(?:ет|ут)) (?:будущее|судьбу)|(?<!не )сбыва(?:ется|ются)(?! ли)|(?<!не )(?:принес(?:ёт|ет|ут)|привлеч(?:ёт|ет|ут)|притяг(?:ивает|ивают|нет|нут)) (?:удачу|деньги|богатство|достаток|любовь)/iu;
// Editorial lessons (EDITS.md): service markers of the source materials and cross-references.
// Source details belong only in the card's «Источник: …» line (assembled from the brief), never in prose.
export const SOURCE_LEFTOVER = /сохранённо[гм][оу]?\s+издани|страниц[аеыу]\s+\d+|\bс\.\s*\d+\b/iu;
export const SERVICE_MARKER = /\((?:припев|молитва|источник|куплет)\s+[A-ZА-Я0-9]\)|\[[A-Z]\]|см\.\s+в\s+статье|\bTODO\b|\{\{|\}\}/u;
// Typography that the normalizer fixes – if it survives, the text was not normalized.
export const BAD_CHARS = /[\u2010\u2011\u00A0\u202F\u2014]/u;

const visibleText = (body) => body
  .replace(/^:::[^\n]*\n[\s\S]*?^:::/gm, "")
  .replace(/<[^>]+>/g, "")
  .replace(/\]\([^)]*\)/g, "]");

function split(md) {
  const match = String(md).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  return match ? [match[1], match[2]] : [null, null];
}
function scalarOf(fm, key) {
  const raw = fm.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1];
  if (raw === undefined) return undefined;
  try {
    return raw.startsWith('"') ? JSON.parse(raw) : raw;
  } catch {
    return raw;
  }
}
export function faqEntries(fm) {
  return [...String(fm).matchAll(/^ {2}- question: (.+)\n {4}answer: (.+)$/gm)].map(([, q, a]) => {
    try {
      return [JSON.parse(q), JSON.parse(a)];
    } catch {
      return [q, a];
    }
  });
}

/** Uniqueness keys of one article (same extraction as the site's stage gates). */
export function uniqueKeys(md) {
  const [fm, body] = split(md);
  const out = { headings: [], questions: [], checklist: [], quotations: [] };
  if (!fm) return out;
  for (const [, quote] of body.matchAll(/^> («[^\n]+»\.?)$/gm)) out.quotations.push(quote);
  for (const [, heading] of body.matchAll(/^## (.+)$/gm)) if (!sharedHeading(heading)) out.headings.push(heading);
  const faqHeading = scalarOf(fm, "faqHeading");
  if (faqHeading) out.headings.push(faqHeading);
  for (const [question] of faqEntries(fm)) out.questions.push(question);
  for (const [, block] of body.matchAll(/^:::checklist\n([\s\S]*?)\n:::/gm)) {
    for (const [, text] of block.matchAll(/^ {2}text: (.+)$/gm)) out.checklist.push(text);
  }
  return out;
}

function visibleParagraphs(body) {
  const plain = stripDirectives(String(body)
    .replace(/<section[\s\S]*?<\/section>/g, "\n")
    .replace(/<p class="article-disclaimer">[\s\S]*?<\/p>/g, "\n")
    .replace(/<[^>]+>/g, "\n"));
  const out = [];
  for (const paragraph of plain.replace(/^\|.*$/gm, "").split(/\n\n+/)) {
    const block = paragraph.trim();
    if (!block || block.startsWith("<") || block.startsWith(":::") || block.startsWith("**Чем закончилась история.")) continue;
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length || lines.every((line) => line.startsWith("- ") || /^#{1,3}\s/.test(line))) continue;
    if (/^\*\*[^*\n]+\?\*\*$/.test(block)) continue;
    const prose = lines.map((line) => line.replace(/^>\s?/, "").replace(/\*\*/g, "")).join(" ").trim();
    if (words(prose) >= PARAGRAPH_MIN_WORDS) out.push(prose);
  }
  return out;
}

/** Every later paragraph that repeats an earlier one. Each later paragraph is reported once. */
function duplicateParagraphs(body) {
  const paragraphs = visibleParagraphs(body);
  const duplicated = [];
  const reported = new Set();
  for (let i = 0; i < paragraphs.length; i += 1) {
    for (let j = i + 1; j < paragraphs.length; j += 1) {
      if (reported.has(j) || !paragraphsTooClose(paragraphs[i], paragraphs[j])) continue;
      reported.add(j);
      duplicated.push(paragraphs[j]);
    }
  }
  return duplicated;
}

/**
 * Checks one assembled article.
 * cfg: { slug, query, title, topic, date, author, maxLabel, practice: {title, author, duration, path},
 *        experts: [{ name, quote }], verbatim: [string], forbiddenPhrases: [string], materials?: string,
 *        expertTags: { name: [gender, group] }, limits }
 * env: { published: Set<slug>, unique: { headings, questions, checklist, quotations } (Map normalized → slug),
 *        referenceGallery: string, portraitExists: (src) => boolean, discomfort?: patterns }
 */
export function checkSzArticle(md, cfg, env) {
  const problems = [];
  const L = cfg.limits;
  const add = (code, field, message, severity = "error") => problems.push({ code, field, message, severity });
  const [fm, body] = split(md);
  if (!fm) {
    add("frontmatter", "*", "нет frontmatter");
    return problems;
  }
  const { slug, query } = cfg;
  const get = (key) => scalarOf(fm, key);
  const nq = normalize(query);

  // ── frontmatter ──
  if (get("title") !== cfg.title) add("title", "*", `title ≠ H1 из брифа «${cfg.title}»`);
  if (get("author") !== cfg.author) add("author", "*", `author ≠ «${cfg.author}»`);
  for (const key of ["publishedAt", "updatedAt"]) if (get(key) !== cfg.date) add("date", "*", `${key} ≠ ${cfg.date}`);
  for (const key of ["draft", "angels", "related", "defaultCtas"]) if (get(key) !== "false") add("flags", "*", `${key}: false`);
  for (const key of ["overview", "reference", "listed", "index"]) if (get(key) !== "true") add("flags", "*", `${key}: true`);
  if (get("topic") !== cfg.topic) add("topic", "*", `topic ≠ ${cfg.topic}`);
  const seo = get("seoTitle") ?? "";
  if ([...seo].length > L.seoTitleMax) add("seoTitle-length", "seoTitle", `seoTitle ${[...seo].length} символов, нужно ≤ ${L.seoTitleMax}`);
  if (!normalize(seo).replace(/^«/, "").startsWith(nq)) add("seoTitle-query", "seoTitle", `seoTitle должен начинаться с запроса «${query}»`);
  if (seo === cfg.title) add("seoTitle-distinct", "seoTitle", "seoTitle совпадает с H1");
  const description = get("description") ?? "";
  const dl = [...description].length;
  if (dl < L.description[0] || dl > L.description[1]) add("description-length", "description", `description ${dl} символов, нужно ${L.description[0]}–${L.description[1]}`);
  if (!normalize(description).includes(nq)) add("description-query", "description", `в description нет запроса «${query}»`);
  if (descriptionOpensWithQuotedQuery(description, query)) add("description-start", "description", `description начинается с запроса в кавычках «${query}» – начните фразу с заглавной, без кавычек`);
  const descriptionFragment = danglingFragment(description);
  if (descriptionFragment) add("description-fragment", "description", `description ${descriptionFragment}`);
  const faqHeading = get("faqHeading") ?? "";
  if (!/^Частые вопросы об? /.test(faqHeading)) add("faqHeading", "faqHeading", "faqHeading начинается с «Частые вопросы о/об …»");
  if (get("ogImage") !== `/media/og/${slug}.jpg`) add("ogImage", "*", "ogImage");
  if (/^ctaUrl:/m.test(fm)) add("max", "*", "ctaUrl запрещён – только дефолтная воронка MAX");
  for (const key of ["ctaInline", "ctaFinal"]) if (!fm.includes(`${key}:\n  buttonLabel: "${cfg.maxLabel}"`)) add("max", "*", `${key}.buttonLabel ≠ «${cfg.maxLabel}»`);
  const p = cfg.practice;
  if (!fm.includes(`practiceAudio:\n  title: ${JSON.stringify(p.title)}\n  author: ${JSON.stringify(p.author)}\n  duration: ${JSON.stringify(p.duration)}\n  src: ""\n  pageUrl: https://audiolad.ru/practice/${p.path}\n  embedUrl: https://audiolad.ru/embed/practice/${p.path}`)) add("practiceAudio", "*", "блок practiceAudio во frontmatter");
  if (/^lead:/m.test(fm)) add("lead", "*", "lead между автором и историей запрещён");
  if (/—/.test(fm + body)) add("em-dash", "*", "длинное тире «—» – только среднее «–»");
  if (BAD_CHARS.test(fm + body)) add("typography", "*", "неразрывный дефис/пробел или длинное тире – не нормализовано");
  if (/^# /m.test(body)) add("h1", "*", "H1 в теле статьи запрещён");

  const pos = (pattern, start = 0) => {
    const relative = body.slice(start).search(pattern);
    return relative < 0 ? -1 : start + relative;
  };
  const need = (value, code, message) => {
    if (value < 0) add(code, "*", message);
    return value;
  };
  // ── canonical order ──
  const pToc = need(pos(/^:::overview\n:::$/m), "order", "нет :::overview");
  const pGallery = need(pos(/^:::gallery\nvariant: angels-carousel/m), "order", "нет карусели ангелов");
  if (pToc < 0 || pGallery < 0) return problems;
  const beforeGallery = body.slice(0, pGallery).trimEnd().split("\n\n");
  const question = beforeGallery.at(-1) ?? "";
  const invitation = beforeGallery.at(-2) ?? "";
  if (!/^\*\*[^\n]+\?\*\*$/.test(question)) add("question", "question", "перед каруселью – жирный вопрос-приглашение «**…?**»");
  else {
    const questionDefect = proseDefect(question, proseLimit("question"));
    if (questionDefect) add("question", "question", questionDefect);
  }
  if (!/ангел/i.test(invitation)) add("invitation", "invitation", "абзац-приглашение перед вопросом должен упоминать ангела");
  else {
    const invitationDefect = proseDefect(invitation, proseLimit("invitation"));
    if (invitationDefect) add("invitation", "invitation", invitationDefect);
  }
  const storyParagraphs = beforeGallery.slice(0, -2);
  const story = storyParagraphs.join("\n\n").trim();
  const sw = words(story);
  if (sw < L.story[0] || sw > L.story[1]) add("story-length", "story", `история ${sw} слов, нужно ${L.story[0]}–${L.story[1]} (вместе с переходом)`);
  if (!/[«»]/.test(storyParagraphs.slice(0, 3).join(" "))) add("story-speech", "story", "прямая речь «…» в первых трёх абзацах истории");
  if (!normalize(storyParagraphs.at(-1) ?? "").includes(nq)) add("transition-query", "transition", `последний абзац истории (переход) должен содержать запрос «${query}»`);
  if (FICTION.test(body)) add("fiction", "story", "оговорка о вымышленности истории запрещена");
  for (const bold of body.matchAll(/\*\*([^*\n]+)\*\*/g)) {
    if (normalize(bold[1]).includes(nq)) add("bold-query", "question", `запрос «${query}» не выделяется жирным («${bold[1].slice(0, 40)}»)`);
  }
  const gallery = body.slice(pGallery).match(/^:::gallery\n[\s\S]*?\n:::/)?.[0];
  if (gallery !== env.referenceGallery) add("gallery", "*", "карусель не дословная копия эталона");
  const pEarly = pos(/^:::cta early\n:::$/m, pGallery);
  if (pEarly < 0 || pEarly > pToc || body.slice(pEarly + ":::cta early\n:::".length, pToc).trim() !== "") add("order", "*", ":::cta early сразу после карусели и перед :::overview");

  // ── practice ──
  const pAudio = need(pos(/^:::practiceAudio\n:::$/m, pToc), "order", "нет :::practiceAudio после оглавления");
  const pChecklist = need(pos(/^:::checklist$/m, Math.max(pAudio, 0)), "order", "нет :::checklist");
  if (pAudio < 0 || pChecklist < 0) return problems;
  const intro = body.slice(pToc + ":::overview\n:::".length, pAudio).trim().split(/\n\n+/).filter(Boolean);
  if (intro.length < 1 || intro.length > 2) add("practice-intro", "practiceIntro", "описание практики – 1–2 абзаца");
  for (const paragraph of intro) if (words(paragraph) > L.practiceIntroWords) add("practice-intro", "practiceIntro", `абзац о практике ${words(paragraph)} слов, нужно ≤ ${L.practiceIntroWords}`);
  if (body.slice(pAudio + ":::practiceAudio\n:::".length, pChecklist).trim() !== "") add("order", "*", "чек-лист сразу после плеера");
  const checklist = body.slice(pChecklist).match(/^:::checklist\n([\s\S]*?)\n:::/)?.[1] ?? "";
  if (!checklist.includes(`storageKey: ${slug}-5-shagov\n`) || !/^persist: local$/m.test(checklist)) add("checklist", "*", "storageKey/persist чек-листа");
  for (const key of ["title", "feedbackEmpty", "feedbackStart", "feedbackHalf", "feedbackDone"]) if (!new RegExp(`^${key}: .+$`, "m").test(checklist)) add("checklist", "checklist", `нет ${key} в чек-листе`);
  const items = [...checklist.matchAll(/^ {2}text: (.+)$/gm)].map((m) => m[1]);
  if (items.length !== 5 || [...checklist.matchAll(/^- id: /gm)].length !== 5) add("checklist", "checklist", "ровно 5 пунктов чек-листа");
  const checklistTitle = checklist.match(/^title: (.+)$/m)?.[1] ?? "";
  const statedChecklist = statedListCount(checklistTitle);
  if (statedChecklist != null && items.length > 0 && statedChecklist !== items.length) add("count-mismatch", "checklist", `заголовок «${checklistTitle}» обещает ${statedChecklist}, а пунктов ${items.length}`);
  for (const item of items) {
    if (words(item) > L.checklistWords) add("checklist-length", "checklist", `пункт чек-листа длиннее ${L.checklistWords} слов: «${item}»`);
    const itemDefect = proseDefect(item, proseLimit("checklist.items"));
    if (itemDefect) add("checklist", "checklist", itemDefect);
  }
  if (cfg.materials) {
    const known = new Set(trigrams(cfg.materials));
    const novel = intro.flatMap((paragraph) => trigrams(paragraph)).filter((t) => /[а-яё]{5,}/.test(t) && !known.has(t));
    if (novel.length > 12) add("practice-materials", "practiceIntro", `в описании практики много формулировок не из материалов (${novel.length} трёхсловий) – свойства практики только из брифа`, "warn");
  }

  // ── psychology + experts ──
  const pPsychology = need(pos(/^## .+: что говорит психология$/m, pChecklist), "order", "нет «## <запрос>: что говорит психология» после чек-листа");
  if (pPsychology < 0) return problems;
  if (normalize(body.slice(pPsychology).split("\n")[0]) !== normalize(`## ${query}: что говорит психология`)) add("psychology-h2", "*", `H2 «${query}: что говорит психология»`);
  const pExpert = need(pos(/<section class="article-expert"/, pPsychology), "experts", "нет карточек экспертов");
  const pFaq = need(pos(/^:::faq\n:::$/m, pEarly), "order", "нет :::faq");
  if (pExpert < 0 || pFaq < 0) return problems;
  const psychologyIntro = body.slice(body.indexOf("\n", pPsychology) + 1, pExpert).trim();
  const introParts = psychologyIntro.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  if (introParts.length !== 1) add("psychology-intro", "psychologyIntro", "ровно один вводный абзац перед карточками");
  else {
    const introDefect = proseDefect(introParts[0], proseLimit("psychologyIntro"));
    if (introDefect) add("psychology-intro", "psychologyIntro", introDefect);
  }
  const cards = [...body.matchAll(/<section class="article-expert" aria-label="([^"]+)">\n([\s\S]*?)<\/section>/g)];
  if (cards.length !== cfg.experts.length) add("experts", "experts", `${cfg.experts.length} карточки экспертов`);
  const tags = [];
  for (const [card, name, html] of cards) {
    const at = body.indexOf(card);
    if (at < pPsychology || at > pFaq) add("experts", "*", `${name}: карточка вне раздела психологии`);
    const src = html.match(/<img class="article-expert-photo" src="([^"]+)"/)?.[1];
    if (!src?.startsWith("/media/experts/") || !env.portraitExists(src)) add("portrait", "*", `${name}: нет локального портрета`);
    if (!/alt="[^"]+" width="96" height="96" loading="lazy"/.test(html)) add("portrait", "*", `${name}: alt/размер портрета`);
    for (const cls of ["name", "role", "credit"]) if (!new RegExp(`<p class="article-expert-${cls}">[^<]+<\\/p>`).test(html)) add("expert-card", "*", `${name}: нет ${cls}`);
    // Card count is not enough: the assembler still emits a card, and «а» / «главная мысль а» used to pass.
    const thesis = html.match(/^### [^:\n]+:\s*(.*)$/m)?.[1] ?? "";
    const thesisDefect = proseDefect(thesis, proseLimit("experts.thesis"));
    if (thesisDefect) add("expert-thesis", "experts", `${name}: ${thesisDefect}`);
    const quotes = [...html.matchAll(/^> («[^\n]+»\.?)$/gm)];
    if (quotes.length !== 1) add("expert-quote", "*", `${name}: ровно одна цитата`);
    const quote = quotes[0]?.[1] ?? "";
    const expected = cfg.experts.find((expert) => expert.name === name);
    if (!expected) add("expert-unknown", "*", `${name}: нет в брифе`);
    else if (quoteText(quote) !== quoteText(expected.quote)) add("expert-quote", "*", `${name}: цитата не совпадает дословно с брифом`);
    if (/article-expert-initials|href=|\]\(/.test(html)) add("expert-card", "experts", `${name}: в карточке нет ссылок и инициалов`);
    const bridge = html.split(/^> «[^\n]+»\.?$/m)[1] ?? "";
    const bridgeDefect = proseDefect(bridge.replace(/<[^>]+>/g, ""), proseLimit("experts.bridge"));
    if (bridgeDefect) add("expert-bridge", "experts", `${name}: ${bridgeDefect}`);
    for (const phrase of expected?.forbiddenInBridge ?? []) if (normalize(bridge).includes(normalize(phrase))) add("expert-bridge", "experts", `${name}: в пояснении нельзя «${phrase}» – эксперт этого не говорит`);
    if (!cfg.expertTags[name]) add("expert-list", "*", `${name}: не из утверждённого списка`);
    else tags.push(...cfg.expertTags[name]);
  }
  for (const tag of ["Ж", "М", "РУ", "ЗАР"]) if (!tags.includes(tag)) add("expert-mix", "*", `эксперты: нужен ${tag}`);

  // ── main body ──
  const mainBody = body.slice(body.lastIndexOf("</section>", pFaq) + "</section>".length, pFaq).trim();
  const h2 = [...mainBody.matchAll(/^## (.+)$/gm)];
  if (h2.length < L.bodyH2[0] || h2.length > L.bodyH2[1]) add("body-sections", "sections", `в основной части ${h2.length} H2, нужно ${L.bodyH2[0]}–${L.bodyH2[1]}`);
  const mw = words(mainBody);
  if (mw < L.mainBody[0] || mw > L.mainBody[1]) add("body-length", "sections", `основная часть ${mw} слов, нужно ${L.mainBody[0]}–${L.mainBody[1]}`);
  for (const block of mainBody.split(/(?=^## )/m)) {
    const title = block.match(/^## (.+)$/m)?.[1];
    if (!title) continue;
    const heading = normalize(title);
    if (heading.startsWith("три шага") || heading.startsWith("когда стоит обратиться")) continue;
    const prose = block.replace(/^## .+$/m, " ").replace(/^### .+$/gm, " ").replace(/^\|.*$/gm, " ");
    if (sectionRetellsStory(story, prose)) add("story-retell", "sections", `раздел «${title}» пересказывает историю`);
  }
  if (!/^\|[^\n]+\|\n\|(?:\s*:?-+:?\s*\|)+$/m.test(mainBody)) add("table", "table", "нет сравнительной таблицы");
  const pSpecialist = pos(/^## Когда стоит обратиться к специалисту$/m, pExpert);
  if (pSpecialist < 0 || pSpecialist > pFaq) add("specialist", "*", "нет «## Когда стоит обратиться к специалисту» перед FAQ");
  else {
    const specialist = body.slice(pSpecialist, pFaq);
    if (!/^- .+$/m.test(specialist)) add("specialist", "specialist", "в разделе о специалисте – список признаков");
    if (!/112/.test(specialist)) add("specialist", "*", "телефон 112");
    if (!/<p class="article-disclaimer">[^<]*не заменяет консультацию психолога или врача[^<]*<\/p>/.test(specialist)) add("disclaimer", "*", "дисклеймер");
  }
  const tableAt = body.search(/^\|(?:\s*:?-+:?\s*\|)+$/m);
  const stepSection = tableAt < 0 ? undefined : body.slice(tableAt).split(/^(?=## )/m).find((section) => (section.match(/^### /gm) || []).length >= 2);
  const stepItems = (stepSection?.match(/^### /gm) || []).length;
  const stepsTitle = stepSection?.match(/^## (.+)$/m)?.[1] ?? "";
  if (stepItems !== 3 || !/^## Три шага/m.test(stepSection ?? "")) add("steps", "steps", "первый раздел с H3 после таблицы – «## Три шага…» ровно с тремя «###»");
  const statedSteps = statedListCount(stepsTitle);
  if (statedSteps != null && stepItems > 0 && statedSteps !== stepItems) add("count-mismatch", "steps", `заголовок «${stepsTitle}» обещает ${statedSteps}, а пунктов ${stepItems}`);
  for (const [, heading] of (stepSection ?? "").matchAll(/^### (.+)$/gm)) {
    // docs/article-numbered-steps.md: the site numbers steps itself; «Если …» headings are scenarios, not steps.
    if (/^(?:\d|Если\s)/iu.test(heading)) add("steps", "steps", `заголовок шага – глагол без номера и без «Если»: «${heading}»`);
    else if (/^Шаг\s*\d/iu.test(heading)) add("steps-number", "steps", `сайт нумерует шаги сам – без «Шаг N.»: «${heading}»`, "warn");
  }

  // ── FAQ ──
  const faq = faqEntries(fm);
  if (faq.length !== L.faqCount) add("faq-count", "faq", `ровно ${L.faqCount} вопросов FAQ`);
  if (!faq.some(([q]) => isSpecialistQuestion(q))) add("faq-specialist", "faq", "один вопрос FAQ – про обращение к специалисту/психологу");
  for (const [q, a] of faq) {
    const aw = words(a);
    if (aw < L.faqAnswer[0] || aw > L.faqAnswer[1]) add("faq-length", "faq", `ответ на «${q}» ${aw} слов, нужно ${L.faqAnswer[0]}–${L.faqAnswer[1]}`);
    const answerFragment = danglingFragment(a);
    if (answerFragment) add("faq-fragment", "faq", `ответ на «${q}» ${answerFragment}`);
    if (faqAnswerTypeMismatch(q, a)) add("faq-answer-type", "faq", `ответ на «${q}» начинается как да/нет, а вопрос открытый`);
  }
  const faqText = faq.flat().join("\n");

  // ── links ──
  const contextual = [...body.slice(0, pFaq).matchAll(/\[[^\]]+\]\(\/s\/([a-z0-9-]+)\)/g)];
  if (contextual.length < L.contextualLinks[0] || contextual.length > L.contextualLinks[1]) add("links-contextual", "sections", `${contextual.length} ссылок /s в тексте, нужно ${L.contextualLinks[0]}–${L.contextualLinks[1]}`);
  let anchorIndex = 0;
  for (const match of body.slice(0, pFaq).matchAll(/\[([^\]]+)\]\(\/s\/([a-z0-9-]+)\)/g)) {
    if (!genericLinkAnchor(match[1])) continue;
    add("links-anchor", "sections", `анкор «${match[1]}» у ссылки /s/${match[2]} слишком общий (#${anchorIndex})`);
    anchorIndex += 1;
  }
  for (const residue of linkLeadResidue(`${body}\n${faqText}`)) {
    add("links-residue", "sections", `оборванный ярлык ссылки: «${residue}»`);
  }
  const links = [...body.matchAll(/(?:\]\(|href=")\/s\/([a-z0-9-]+)(?:[)#"?])/g)].map((m) => m[1]);
  for (const link of links) if (!env.published.has(link)) add("links-target", "sections", `ссылка /s/${link} не на опубликованную статью`);
  const urls = [...(fm + "\n" + body).matchAll(/(?:https?:)?\/\/[^\s)"'<>]+/g)].map((m) => m[0]);
  const practiceUrls = [`https://audiolad.ru/practice/${p.path}`, `https://audiolad.ru/embed/practice/${p.path}`];
  const practiceHits = urls.filter((url) => practiceUrls.includes(url));
  if (practiceHits.join("\n") !== practiceUrls.join("\n")) add("links-external", "*", `нужны pageUrl и embedUrl практики в этом порядке: ${practiceUrls.join(", ")}`);
  for (const url of urls) if (!practiceUrls.includes(url) && !allowedSiteAddress(url)) add("links-external", "*", `внешний адрес запрещён: ${url}`);
  for (const [, href] of body.matchAll(/(?:href="|\]\()([^")]+)/g)) {
    if (/^\/s\/[a-z0-9-]+$/.test(href) || allowedSiteAddress(href)) continue;
    add("links-internal", "sections", `ссылка ${href}: только /s/<slug> или адрес audiolad.ru / sergey-zoya.ru`);
  }
  for (const problem of outgoingAddressProblems(fm + "\n" + body)) add("links-external", "*", problem);
  if (/azbyka|wikipedia|litres|max\.ru|max-potok/i.test(body + faqText)) add("links-external", "*", "упоминание сторонних сайтов / MAX в тексте");

  // ── content safety ──
  const visible = visibleText(body);
  const all = visible + "\n" + faqText;
  if (SUMMONING.test(all)) add("summoning", "*", `«${all.match(SUMMONING)[0]}» – без призыва, оберегов и обещаний защиты`);
  if (ZOYA_PSYCHOLOGIST.test(body + fm)) add("zoya", "*", "Зоя не называется психологом");
  if (PROMISE.test(all)) add("promise", "*", `обещание результата/исцеления: «${all.match(PROMISE)[0]}»`);
  for (const { name, re } of env.discomfort ?? DISCOMFORT_PATTERNS) {
    const hit = (all + "\n" + checklist).match(re);
    if (hit) add("discomfort", "*", `практику описываем только позитивно: «${hit[0]}» (${name})`);
  }
  for (const sentence of siteDiscomfortHits(md)) add("discomfort", "*", `check-no-discomfort-priming сайта: «${sentence}»`);
  for (const ban of cfg.expertBans ?? []) {
    const hit = (all + "\n" + body).match(new RegExp(ban.source, ban.flags));
    if (hit) add("expert-caution", "experts", `${ban.expert}: «${hit[0]}» – ${ban.name} (EXPERTS_RU.md, «Осторожно»)`);
  }
  const leftover = all.split("\n").filter((line) => !/^Источник: /.test(line.trim())).join("\n").match(SOURCE_LEFTOVER);
  if (leftover) add("service-marker", "*", `служебная пометка источника в тексте: «${leftover[0]}» – только «В книге «…» автор пишет»`);
  const science = all.match(UNSUPPORTED_SCIENCE);
  if (science) add("unsupported-science", "*", `«${science[0]}» без источника в брифе – «Психологи объясняют…» или факт из брифа`);
  const quotedQuery = all.match(new RegExp(`«${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}»`, "iu"));
  if (quotedQuery) add("query-quoted", "*", `запрос в кавычках «${query}» – вплети его в фразу грамматично, без кавычек`);
  const disclaimers = (body.match(/class="article-disclaimer"/g) ?? []).length;
  if (disclaimers !== 1) add("disclaimer", "*", `article-disclaimer: ${disclaimers}, нужен ровно один (после телефонов)`);
  const date = all.match(VISIBLE_DATE);
  if (date) add("visible-date", "*", `видимая дата «${date[0]}» – на сайте даты в тексте запрещены (check-no-visible-dates)`);
  const mixed = (all + "\n" + fm).split(/[^\p{L}-]+/u).find((word) => MIXED_SCRIPT.test(word));
  if (mixed) add("mixed-script", "*", `латиница внутри русского слова: «${mixed}»`);
  if (PREDICTION.test(all)) add("prediction", "*", `«${all.match(PREDICTION)[0]}» – символы не предсказывают и не «сбываются», без обещаний удачи/денег`);
  const marker = (all + "\n" + fm).match(SERVICE_MARKER);
  if (marker) add("service-marker", "*", `служебная пометка в тексте: «${marker[0]}»`);
  for (const phrase of cfg.forbiddenPhrases ?? []) if (normalize(all).includes(normalize(phrase))) add("forbidden", "*", `запрещённая брифом фраза «${phrase}»`);
  const tw = words(all);
  if (tw < L.total[0] || tw > L.total[1]) add("total-length", "sections", `всего ${tw} слов с FAQ, нужно ${L.total[0]}–${L.total[1]}`);
  const mainCount = normalize(body).split(nq).length - 1;
  if (mainCount < L.mainQuery[0] || mainCount > L.mainQuery[1]) add("query-count", "sections", `запрос «${query}» в тексте ${mainCount} раз, нужно ${L.mainQuery[0]}–${L.mainQuery[1]}`);
  const bodyNorm = normalize(body);
  for (const phrase of cfg.additionalQueries ?? []) {
    const needle = normalize(phrase);
    if (!needle) continue;
    if (!bodyNorm.includes(needle)) add("extra-query", "sections", `дополнительный запрос «${phrase}» не встречается в тексте`);
  }
  for (const duplicated of duplicateParagraphs(body)) add("duplicate-paragraph", "sections", `абзац повторяет уже сказанное: «${duplicated.slice(0, 70)}»`);
  for (const verbatim of cfg.verbatim ?? []) {
    // Verified texts (prayers, poems) quoted in «…»: the whole text or its beginning ending with «…».
    const head = verbatim.slice(0, 12);
    for (const [, quoted] of body.matchAll(/«([^»]{20,})»/g)) {
      if (!quoted.startsWith(head)) continue;
      const ok = quoted.endsWith("…") ? verbatim.startsWith(quoted.slice(0, -1)) : verbatim === quoted;
      if (!ok) add("verbatim", "*", `текст «${quoted.slice(0, 40)}…» не дословен по материалам`);
    }
  }

  // ── tail ──
  const pReadmore = need(pos(/<section class="article-readmore" aria-labelledby="readmore-heading">/, pFaq), "order", "нет «Читайте также»");
  const pGrid = need(pos(/<img src="\/media\/angels\/four-angels-06-all-angels\.webp"/, Math.max(pReadmore, 0)), "order", "нет картинки всех ангелов");
  const pFinal = need(pos(/^:::cta final\n:::$/m, Math.max(pGrid, 0)), "order", "нет :::cta final");
  if (pReadmore >= 0 && pGrid >= 0 && pFinal >= 0) {
    const endingBody = body.slice(pFaq, pReadmore);
    const ending = endingBody.match(/\*\*Чем закончилась история\.\*\*([^\n]*)/);
    if (!ending) add("story-ending", "storyEnding", "«**Чем закончилась история.**» между FAQ и «Читайте также»");
    else {
      const endingDefect = proseDefect(ending[1], proseLimit("storyEnding"));
      if (endingDefect) add("story-ending", "storyEnding", endingDefect);
    }
    const moreAt = body.indexOf(":::morelinks\n:::");
    if (moreAt >= 0 && pGrid > moreAt) {
      const chunks = body.slice(moreAt + ":::morelinks\n:::".length, pGrid).trim().split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
      const invite = chunks.find((part) => !part.startsWith("**") && !part.startsWith("<"));
      const inviteDefect = proseDefect(invite ?? "", proseLimit("finalInvite"));
      if (inviteDefect) add("final-invite", "finalInvite", inviteDefect);
      const finalQuestion = chunks.find((part) => part.startsWith("**")) ?? "";
      const finalQuestionDefect = proseDefect(finalQuestion, proseLimit("finalQuestion"));
      if (finalQuestionDefect) add("final-question", "finalQuestion", finalQuestionDefect);
    }
    const readmore = body.slice(pReadmore, pGrid);
    if (!readmore.includes('<h2 id="readmore-heading">Читайте также</h2>') || [...readmore.matchAll(/<li><a href="\/s\//g)].length !== 3) add("readmore", "*", "«Читайте также» – 3 ссылки");
    if (body.slice(pFinal).trim() !== ":::cta final\n:::") add("order", "*", "статья заканчивается :::cta final");
    const order = [pGallery, pEarly, pToc, pAudio, pChecklist, pPsychology, pExpert, pFaq, pReadmore, pGrid, pFinal];
    if (order.some((value, i) => i > 0 && value <= order[i - 1])) add("order", "*", "нарушен канонический порядок блоков");
  }
  for (const marker of ["gallery", "practiceAudio", "checklist", "faq", "cta early", "cta final"]) {
    if (body.split(`:::${marker}\n`).length - 1 !== 1) add("order", "*", `ровно один блок :::${marker}`);
  }

  auditHollowProse(body, add);

  // ── uniqueness against the site ──
  const own = uniqueKeys(md);
  const seen = (kind, label, field) => {
    for (const text of own[kind]) {
      const other = env.unique?.[kind]?.get(normalize(text));
      if (other && other !== slug) add("unique", field, `${label} «${text}» уже есть в статье ${other}`);
    }
    const keys = own[kind].map(normalize);
    keys.forEach((key, i) => keys.indexOf(key) !== i && add("unique", field, `${label} повторяется внутри статьи`));
  };
  seen("headings", "заголовок", "sections");
  seen("questions", "вопрос FAQ", "faq");
  seen("checklist", "пункт чек-листа", "checklist");
  seen("quotations", "цитата", "*");

  // ── warnings (do not block) ──
  const queryStems = new Set((normalize(query).match(/[а-я]{7,}/g) ?? []).map((w) => w.slice(0, 6)));
  let repeats = 0;
  for (const line of visible.split(/\n+/)) {
    if (/^\s*(?:#|\||-|>|\*\*Чем)/.test(line)) continue;
    for (const sentence of line.split(/(?<=[.!?…])\s+/)) {
      const stems = (normalize(sentence).match(/[а-я]{7,}/g) ?? []).map((w) => w.slice(0, 6)).filter((stem) => !queryStems.has(stem));
      const repeated = stems.find((stem, i) => stems.indexOf(stem) !== i);
      if (repeated && repeats++ < 5) add("repeat-stem", "*", `однокоренной повтор в предложении («${repeated}…»): «${sentence.slice(0, 70)}»`, "warn");
    }
  }
  return problems;
}

function trigrams(text) {
  const tokens = normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.slice(2).map((token, i) => `${tokens[i]} ${tokens[i + 1]} ${token}`);
}

/** Pack-level checks: rotation (≤2 per expert) and cross-article uniqueness inside the pack. */
export function checkSzPack(items) {
  const problems = [];
  const usage = new Map();
  for (const { cfg } of items) for (const expert of cfg.experts) usage.set(expert.name, (usage.get(expert.name) ?? 0) + 1);
  for (const [name, count] of usage) if (count > 2) problems.push({ code: "rotation", field: "*", slug: null, message: `ротация: «${name}» в ${count} статьях пакета`, severity: "error" });
  const owners = new Map();
  for (const { cfg, md } of items) {
    const keys = uniqueKeys(md);
    for (const kind of Object.keys(keys)) {
      for (const text of keys[kind]) {
        const key = `${kind}:${normalize(text)}`;
        const other = owners.get(key);
        if (other && other !== cfg.slug) problems.push({ code: "unique-pack", field: kind === "questions" ? "faq" : kind === "checklist" ? "checklist" : "sections", slug: cfg.slug, message: `«${text}» повторяет статью пакета ${other}`, severity: "error" });
        else owners.set(key, cfg.slug);
      }
    }
  }
  return problems;
}
