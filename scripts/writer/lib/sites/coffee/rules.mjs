// Deterministic checks of the coffee template on an assembled article (assemble.mjs).
// error = blocks the pack (one repair call is allowed), warning = goes to the PR body.
import { COFFEE } from "./config.mjs";
import { expertSlotProblems, isAllowedTextHref, isInternalHref } from "./brief.mjs";

const LATIN = /[A-Za-z]/;
const EM_DASH = /\u2014/;
const WORD = /[0-9A-Za-zА-Яа-яЁё]+(?:[-–][0-9A-Za-zА-Яа-яЁё]+)*/g;

export const FORBIDDEN = [
  { re: /(^|[^а-яё])точк(?:а|и|е|у|ой|ою|ам|ами|ах)?(?![а-яё])/i, message: "слово «точка» – пишите «кофейня» (в единственном числе); «точка безубыточности» → «порог безубыточности»",
    // Idioms that never mean a venue (the approved reference uses «отправная точка»).
    strip: (text) => String(text).replace(/отправн\S* точк\S*|точк\S* зрения|точк\S* отсч[её]та/gi, "") },
  { re: /редакци/i, message: "слово «Редакция» – подпись сектора «АудиоЛад Кофейни» ставит сайт" },
  { re: /плеер|плейлист|комментари|подпишитесь|ставьте лайк/i, message: "на странице нет плееров, плейлистов и комментариев" },
  { re: /https?:\/\/|www\.|\.ru\b|\.com\b|t\.me|телеграм|вконтакте|инстаграм/i, message: "адрес сайта или соцсети в тексте – ссылки только через [анкор](адрес) из брифа" },
];

// Never prime a negative experience (owner rule). Business words such as «риск» or «расход» are fine.
export const MUSIC = /музык|(^|[^а-яё])трек|песн|мелоди|саундтрек|радио(?!активн)/i;

export const NEGATIVE = [
  /дискомфорт/i, /неприятн/i, /неуютн/i, /раздраж/i, /стресс/i, /тревож/i, /тревог/i, /(^|[^а-яё])страх(?!ов)/i, /боит/i, /бояться/i,
  /стыд/i, /провал/i, /разочаров/i, /выгора/i, /кошмар/i, /паник/i, /ужас/i, /обидн/i, /беси/i, /злит/i,
  // Direct pain, heaviness and fatigue wording (Codex review of #1086).
  /(^|[^а-яё])(боль|боли|болью|болей|болит|болят|болела|болел|заболе\S*|болезн\S*|болезненн\S*)(?![а-яё])/i,
  /неприятно/i, /тяжело/i, /(^|[^а-яё])тягост/i, /устал/i, /утомл/i, /измотан/i, /мучит/i, /мучени/i, /страда/i, /напряжени/i, /неловк/i, /неудобн/i, /досад/i, /жалоб/i, /недовол/i,
];

const FIRST_PERSON = /(^|[^а-яё])(я|мне|меня|мной|мой|моя|моё|мои|мою|моей|мы|нам|нас|наш|наша|наше)(?![а-яё])/i;
// Narrative openers: coffee guides never start with a story (owner rule 2026-10-30).
const STORY_MARKERS = /(^|[^а-яё])(однажды|помню|как-то раз|в то утро|тем утром|в тот день|тем вечером|история о том)(?![а-яё])/i;

/** Replies of direct speech: «…» quotes plus lines that open with a dash. */
export function dialogueLines(paragraphs) {
  let count = 0;
  for (const paragraph of paragraphs) {
    count += paragraph.match(/«[^»]{2,}»/g)?.length ?? 0;
    count += paragraph.split("\n").filter((line) => /^\s*–\s+\S/.test(line) && !/«/.test(line)).length;
  }
  return count;
}

/** Capitalised words that do not open a sentence, a quote or a reply (likely names or places). */
export function capitalisedMidSentence(text) {
  const found = [];
  const tokens = String(text).split(/\s+/).filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    const word = tokens[i].replace(/^[«(„"]+/, "").replace(/[^А-Яа-яЁё-]+$/, "");
    if (!/^[А-ЯЁ][а-яё]{2,}/.test(word)) continue;
    if (/^[«(„"]/.test(tokens[i])) continue;
    const prev = tokens[i - 1];
    if (/[.!?…:]["»)]?$/.test(prev) || prev === "–" || prev === "-") continue;
    found.push(word);
  }
  return found;
}

// Statistics and research claims: allowed only from a brief fact that names its source in words.
export const STAT = /%|процент|(^|[^а-яё])(?:исследовани|исследова[лт]|опрос|опрош|статистик|учён(?:ые|ых)|доказан)|по данным|в среднем|(^|[^а-яё])в \d+(?:[.,]\d+)? раз/i;
// A worked example («например», a formula) may use its own numbers.
const ILLUSTRATIVE = /например|допустим|предположим|при дозе|[×÷]|раздели|умнож/i;
const NUMBER = /\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)?/g;
export const numbersIn = (text) => (String(text).match(NUMBER) ?? []).map((n) => n.replace(/[ \u00a0]/g, "").replace(",", "."));
const sentences = (text) => String(text).split(/(?<=[.!?…])\s+/).filter(Boolean);

/** Source part of a brief fact: «Утверждение. Источник: название, дата». */
export function factSource(fact) {
  return String(fact).split(/Источник:/i)[1]?.trim() ?? "";
}
// Words that every source shares and that therefore name nothing.
const GENERIC_SOURCE = /^(опрос|иссле|данны|стати|отчёт|отчет|кофей|кофее|компа|сайта|интер|источ|резул|годов)/;
/** Does the text name the fact's source? At least half of its distinctive words (by first 5 letters). */
export function namesSource(text, fact) {
  const stems = [...new Set((factSource(fact).toLowerCase().replace(/ё/g, "е").match(/[а-я]{5,}/g) ?? []).map((w) => w.slice(0, 5)).filter((stem) => !GENERIC_SOURCE.test(stem)))];
  const have = String(text).toLowerCase().replace(/ё/g, "е");
  const hits = stems.filter((stem) => have.includes(stem)).length;
  return stems.length > 0 && hits >= Math.ceil(stems.length / 2);
}

/** Numbers and statistics that are not grounded in the brief facts or the expert registry. */
export function ungroundedClaims(texts, brief, experts) {
  const grounded = [brief.title, brief.primaryQuery, ...brief.facts];
  for (const slot of brief.experts) {
    const expert = experts?.get(slot.id);
    if (!expert) continue;
    grounded.push(expert.competence ?? "", slot.translation ?? "");
    for (const quote of expert.quotes ?? []) grounded.push(quote.text, quote.context, quote.sourceLabel ?? "");
  }
  const known = new Set(grounded.flatMap(numbersIn));
  const out = [];
  for (const [field, text] of texts) {
    const list = sentences(text);
    for (const [index, sentence] of list.entries()) {
      const nums = numbersIn(sentence);
      if (STAT.test(sentence)) {
        // The source is named in the same sentence or right before it.
        const near = `${list[index - 1] ?? ""} ${sentence}`;
        const backed = brief.facts.some((fact) => (nums.length === 0 || nums.some((n) => numbersIn(fact).includes(n))) && namesSource(near, fact));
        if (!backed) out.push([field, `статистика или исследование без источника: «${sentence.slice(0, 90)}» – только из фактов брифа, источник назван словами в тексте`]);
        continue;
      }
      if (ILLUSTRATIVE.test(sentence)) continue;
      for (const n of nums) {
        const value = Number(n);
        const year = Number.isInteger(value) && value >= 1800 && value <= 2100;
        if (!year && value <= 10) continue;
        if (!known.has(n)) out.push([field, `число ${n} не из фактов брифа: «${sentence.slice(0, 90)}» – цифры и даты только из фактов с источником`]);
      }
    }
  }
  return out;
}

export const words = (text) => String(text).match(WORD)?.length ?? 0;
const partText = (paragraph) => paragraph.map((part) => (typeof part === "string" ? part : part.label)).join("");
const partLinks = (paragraph) => paragraph.filter((part) => typeof part !== "string");

/** [field, text] for every visible string the data module renders. */
export function visibleTexts(article) {
  const out = [
    ["title", article.title], ["seoTitle", article.seoTitle], ["description", article.description],
    ["question", article.question], ["hero.alt", article.hero.alt], ["hero.caption", article.hero.caption],
    ...article.intro.map((text, i) => [`intro[${i}]`, text]),
  ];
  const sections = [...article.partOne.map((s, i) => [`partOne[${i}]`, s]), ...article.partTwo.map((s, i) => [`partTwo[${i}]`, s])];
  for (const [field, section] of sections) {
    out.push([`${field}.heading`, section.heading]);
    section.paragraphs.forEach((p, i) => out.push([`${field}.paragraphs[${i}]`, partText(p)]));
  }
  out.push(["table.heading", article.table.heading], ["table.caption", article.table.caption]);
  article.table.intro.forEach((p) => out.push(["table.intro", partText(p)]));
  article.table.after.forEach((p) => out.push(["table.after", partText(p)]));
  article.table.columns.forEach((c) => out.push(["table.columns", c]));
  article.table.rows.flat().forEach((c) => out.push(["table.rows", c]));
  for (const key of ["expertOne", "expertTwo"]) {
    const slot = article[key];
    out.push([`${key}.heading`, slot.heading]);
    slot.lead.forEach((p) => out.push([`${key}.lead`, partText(p)]));
    slot.after.forEach((p) => out.push([`${key}.after`, partText(p)]));
    if (slot.translation) out.push([`${key}.translation`, slot.translation]);
  }
  out.push(["steps.heading", article.steps.heading], ["steps.intro", article.steps.intro]);
  article.steps.items.forEach((s, i) => out.push([`steps.items[${i}].title`, s.title], [`steps.items[${i}].text`, s.text]));
  out.push(["checklist.title", article.checklist.title], ["checklist.note", article.checklist.note], ["checklist.doneNote", article.checklist.doneNote]);
  article.checklist.items.forEach((item, i) => out.push([`checklist.items[${i}]`, item.text]));
  article.faq.forEach((item, i) => out.push([`faq[${i}].question`, item.question], [`faq[${i}].answer`, item.answer]));
  out.push(["finalQuestion", article.finalQuestion]);
  article.readMore.forEach((link, i) => out.push([`readMore[${i}]`, link.label]));
  return out;
}

export function textLinks(article) {
  const paragraphs = [
    ...[...article.partOne, ...article.partTwo].flatMap((s) => s.paragraphs),
    ...article.table.intro, ...article.table.after,
    ...[article.expertOne, article.expertTwo].flatMap((slot) => [...slot.lead, ...slot.after]),
  ];
  return paragraphs.flatMap(partLinks);
}

const norm = (text) => String(text).toLowerCase().replace(/ё/g, "е");
const stems = (text) => norm(text).match(/[а-яa-z0-9]+/g) ?? [];
/** Every significant word of the query (by a 4-letter stem) occurs in the text: «кофе в зёрнах … для кофейни». */
export function hasQueryWords(text, query) {
  const have = stems(text);
  return stems(query).filter((w) => w.length > 2).every((w) => have.some((h) => h.startsWith(w.slice(0, Math.max(4, w.length - 2)))));
}
const countQuery = (text, query) => norm(text).split(norm(query)).length - 1;

/**
 * @param article assembled VerticalGuideArticle
 * @param brief   normalized pack article (brief.mjs)
 * @param env     { experts: Map, repoDir?: string, avoid?: Set<string> }
 */
export function checkCoffeeArticle(article, brief, env) {
  const L = COFFEE.limits;
  const problems = [];
  const error = (field, message) => problems.push({ field, severity: "error", message });
  const warn = (field, message) => problems.push({ field, severity: "warning", message });
  const texts = visibleTexts(article);

  for (const [field, text] of texts) {
    if (EM_DASH.test(text)) error(field, "длинное тире «—» – только «–»");
    if (LATIN.test(text)) error(field, `латиница в тексте: «${String(text).match(/.{0,20}[A-Za-z]+.{0,20}/)?.[0]}»`);
    for (const rule of FORBIDDEN) if (rule.re.test(rule.strip ? rule.strip(text) : text)) error(field, rule.message);
    if (MUSIC.test(text)) error(field, "музыка в тексте статьи – по правилу владельца статьи о кофейнях без музыки, плееров и плейлистов");
    for (const re of NEGATIVE) if (re.test(text)) { error(field, `негативная формулировка («${String(text).match(re)[0]}…») – правило: не настраивать на неприятный опыт`); break; }
  }

  // Intro: no opening story (owner rule 2026-10-30) – straight to the practical topic, query first.
  const intro = article.intro;
  const introText = intro.join("\n");
  if (intro.length < L.intro[0] || intro.length > L.intro[1]) error("intro", `вступление – ${L.intro[0]}–${L.intro[1]} абзаца, сейчас ${intro.length}`);
  const introWords = words(introText);
  if (introWords < L.introWords[0] || introWords > L.introWords[1]) error("intro", `вступление – ${L.introWords[0]}–${L.introWords[1]} слов, сейчас ${introWords}`);
  if (!intro[0] || countQuery(intro[0], brief.primaryQuery) < 1) error("intro[0]", `первый абзац вступления содержит запрос «${brief.primaryQuery}»`);
  else if (!norm(intro[0]).startsWith(norm(brief.primaryQuery))) warn("intro[0]", `лучше начать первый абзац с запроса «${brief.primaryQuery}», как в эталоне`);
  if (dialogueLines(intro) > 0) error("intro", "во вступлении нет истории, диалогов и прямой речи – сразу к теме");
  if (FIRST_PERSON.test(introText)) error("intro", "вступление без рассказчика «я/мы» – статья не открывается историей");
  if (STORY_MARKERS.test(introText)) error("intro", `похоже на историю («${introText.match(STORY_MARKERS)[2]}») – статьи о кофейнях начинаются сразу с практической темы`);

  // No invented numbers or statistics: every claim must come from a brief fact with a named source.
  for (const [field, message] of ungroundedClaims(texts.filter(([f]) => !/^readMore|\.translation$/.test(f)), brief, env.experts)) error(field, message);

  // SEO.
  const q = brief.primaryQuery;
  if (article.seoTitle.length > L.seoTitleMax) error("seoTitle", `seoTitle ≤ ${L.seoTitleMax} символов, сейчас ${article.seoTitle.length}`);
  if (!norm(article.seoTitle).startsWith(norm(q))) error("seoTitle", `seoTitle начинается с «${q}»`);
  if (article.description.length < L.description[0] || article.description.length > L.description[1]) error("description", `description ${L.description[0]}–${L.description[1]} символов, сейчас ${article.description.length}`);
  if (!countQuery(article.description, q)) error("description", `description содержит «${q}»`);
  if (!countQuery(article.hero.alt, q)) error("hero.alt", `alt картинки содержит «${q}»`);
  if (![...article.partOne, ...article.partTwo].some((s) => hasQueryWords(s.heading, q))) error("partOne", `хотя бы один H2 содержит слова запроса «${q}»`);
  const body = texts.filter(([field]) => !/^(title|seoTitle|description|hero\.)/.test(field)).map(([, text]) => text).join("\n");
  const occurrences = countQuery(body, q);
  if (occurrences < L.queryCount[0] || occurrences > L.queryCount[1]) error("query", `запрос «${q}» в тексте ${L.queryCount[0]}–${L.queryCount[1]} раз, сейчас ${occurrences}`);
  const total = words(texts.map(([, text]) => text).join("\n"));
  if (total < L.totalWords[0] || total > L.totalWords[1]) error("total", `объём ${L.totalWords[0]}–${L.totalWords[1]} слов, сейчас ${total}`);

  // Structure: text alternates with inserts (2 + 3 sections), mobile-friendly table.
  if (article.partOne.length !== 2) error("partOne", "ровно 2 раздела");
  if (article.partTwo.length !== 3) error("partTwo", "ровно 3 раздела");
  for (const [i, section] of [...article.partOne, ...article.partTwo].entries()) {
    const n = section.paragraphs.length;
    if (!section.heading) error(`section[${i}]`, "нет заголовка");
    if (n < L.sectionParagraphs[0] || n > L.sectionParagraphs[1]) error(`section[${i}]`, `${L.sectionParagraphs[0]}–${L.sectionParagraphs[1]} абзаца, сейчас ${n}`);
    for (const p of section.paragraphs) if (words(partText(p)) > 130) error(`section[${i}]`, "абзац длиннее 130 слов – без длинных полотен");
  }
  const cols = article.table.columns.length;
  if (cols < L.tableColumns[0] || cols > L.tableColumns[1]) error("table.columns", `${L.tableColumns[0]}–${L.tableColumns[1]} столбца`);
  if (article.table.rows.length < L.tableRows[0] || article.table.rows.length > L.tableRows[1]) error("table.rows", `${L.tableRows[0]}–${L.tableRows[1]} строк`);
  const firstCells = article.table.rows.map((row) => row[0]);
  if (new Set(firstCells).size !== firstCells.length) error("table.rows", "первые значения строк должны быть разными – на телефоне это заголовки карточек");
  for (const [i, row] of article.table.rows.entries()) {
    if (row.length !== cols) error(`table.rows[${i}]`, `в строке ${row.length} значений, столбцов ${cols}`);
    for (const cell of row) if (words(cell) > 25) warn(`table.rows[${i}]`, "длинное значение – на телефоне карточка станет тяжёлой");
  }
  if (article.steps.items.length !== 3) error("steps", "ровно 3 шага");
  if (!/^Три шага/.test(article.steps.heading)) warn("steps.heading", "заголовок обычно начинается с «Три шага»");
  if (article.checklist.items.length !== L.checklist) error("checklist", `ровно ${L.checklist} пунктов`);
  if (article.faq.length < L.faq[0] || article.faq.length > L.faq[1]) error("faq", `${L.faq[0]}–${L.faq[1]} вопросов`);
  for (const [i, item] of article.faq.entries()) {
    const n = words(item.answer);
    if (n < L.faqAnswerWords[0] || n > L.faqAnswerWords[1]) error(`faq[${i}]`, `ответ ${L.faqAnswerWords[0]}–${L.faqAnswerWords[1]} слов, сейчас ${n}`);
    if (!item.question.endsWith("?")) error(`faq[${i}]`, "вопрос заканчивается «?»");
  }
  for (const field of ["question", "finalQuestion"]) if (!String(article[field]).endsWith("?")) error(field, "вопрос заканчивается «?»");

  // Links: only from the brief, only allowed hosts; the page opens every one in a new tab.
  const allowed = new Set(brief.links);
  for (const link of textLinks(article)) {
    if (!isAllowedTextHref(link.href)) error("links", `запрещённая ссылка ${link.href} – только audiolad.ru, статьи sergey-zoya.ru и MAX`);
    else if (!allowed.has(link.href)) error("links", `ссылки ${link.href} нет в брифе`);
  }
  for (const link of article.readMore) if (!isInternalHref(link.href)) error("readMore", `только внутренние ссылки: ${link.href}`);
  const used = new Set(textLinks(article).map((link) => link.href));
  if (brief.links.length && used.size === 0) warn("links", "в тексте нет ни одной ссылки из брифа");

  // Experts: registry, licensed portrait, Russian-only, pair man/woman and ru/foreign.
  for (const [i, key] of ["expertOne", "expertTwo"].entries()) {
    const slot = article[key];
    const briefSlot = brief.experts[i];
    if (slot.expertId !== briefSlot?.id) error(key, `эксперт должен быть ${briefSlot?.id}`);
    for (const message of expertSlotProblems({ id: slot.expertId, quoteIndex: slot.quoteIndex, translation: slot.translation }, env.experts, { repoDir: env.repoDir })) error(key, message);
    if (!slot.heading || !partText(slot.lead[0] ?? [])) error(key, "нужны heading и lead");
  }

  // Uniqueness against the section and the other articles of the pack.
  for (const [field, text] of texts.filter(([f]) => /heading$|question$/.test(f))) {
    if (env.avoid?.has(norm(text))) warn(field, `«${text}» уже есть в разделе или пакете`);
  }
  return problems;
}

/** Headings and FAQ questions of an article (for env.avoid of the next ones). */
export function uniqueKeys(article) {
  return visibleTexts(article).filter(([f]) => /heading$|question$/.test(f) && f !== "question").map(([, text]) => norm(text));
}
