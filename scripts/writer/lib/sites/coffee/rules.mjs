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
  /дискомфорт/i, /неприятн/i, /неуютн/i, /раздраж/i, /стресс/i, /тревож/i, /тревог/i, /(^|[^а-яё])страх(?!ов)/i,
  // «не боится», «не бояться» reassure (Codex should-fix of #1086, rules.mjs:23); only the affirmative primes fear.
  /(?<!(?:^|[^а-яё])не\s+)бо(?:ит|ят|юсь|ишь|ялся|ялась|ялись|ясь|яться)/i,
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

// Ordinal + noun in the nominative that disagree in gender («Третий место», «первая шаг»).
const ORDINAL = /^(перв|втор|трет|четв[её]рт|пят|шест|седьм|восьм|девят|десят|последн|следующ)(ый|ой|ий|ая|ья|яя|ое|ье|ее)$/;
const ORDINAL_GENDER = { ый: "m", ой: "m", ий: "m", ая: "f", ья: "f", яя: "f", ое: "n", ье: "n", ее: "n" };
const NOUN_GENDER = new Map([
  ..."место правило решение условие помещение оборудование окно дело пространство освещение меню".split(" ").map((w) => [w, "n"]),
  ..."зона стойка часть задача ошибка чашка линия позиция поверхность столешница полка станция кофемашина кофемолка касса витрина".split(" ").map((w) => [w, "f"]),
  ..."шаг этап вариант стол модуль уровень раздел ряд вопрос ящик блок прилавок проход гость".split(" ").map((w) => [w, "m"]),
]);
const GENDER_WORD = { m: "мужской", f: "женский", n: "средний" };
// «-ой» is the masculine nominative only for stressed ordinals (второй, шестой, седьмой, восьмой);
// «первой», «третьей», «последней» are feminine oblique cases and never agree with a nominative noun.
const STRESSED_OJ = /^(втор|шест|седьм|восьм)$/;
/**
 * Obvious agreement slips of an ordinal and the next noun: ["Третий место", …]. Only two words of the
 * same phrase are compared: punctuation between them (a sentence end, a comma, a colon) breaks the pair,
 * so «Начните с первой. Место хранения…» is not a slip (Codex should-fix of #1086, rules.mjs:130).
 */
export function ordinalAgreementSlips(text) {
  const tokens = String(text).split(/\s+/).filter(Boolean);
  const slips = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const head = tokens[i].replace(/^[«„"(]+/, "");
    if (!/^[А-Яа-яЁё]+$/.test(head)) continue; // trailing punctuation ends the phrase
    const match = norm(head).match(ORDINAL);
    if (!match) continue;
    if (match[2] === "ой" && !STRESSED_OJ.test(match[1])) continue;
    const next = tokens[i + 1].replace(/[^А-Яа-яЁё]+$/, "");
    if (!/^[А-Яа-яЁё]+$/.test(next)) continue;
    const gender = ORDINAL_GENDER[match[2]];
    const noun = NOUN_GENDER.get(norm(next));
    if (gender && noun && gender !== noun) slips.push({ text: `${head} ${next}`, noun: GENDER_WORD[noun] });
  }
  return slips;
}

// Columns whose header promises figures: every cell must carry a number.
// Whole words only: «Нормативный документ» or «Весь ассортимент» are descriptive headers
// (Codex should-fix of #1086, rules.mjs:143).
export const NUMERIC_COLUMN = /(^|[^а-яё])(размер\S*|высот\S*|глубин\S*|ширин\S*|длин[аыеу]|габарит\S*|цен[аыеу]|стоимост\S*|сумм[аыеу]?|бюджет\S*|руб\S*|см|мм|м|кг|г|л|количеств\S*|сколько|срок\S*|объ[её]м\S*|вес|веса|процент\S*|норм[аы]?|расстояни\S*)(?![а-яё])|₽|%/i;
// Exclamatory filler: guides keep a calm business tone.
const EXCLAMATORY = /!|(^|[.?…]\s+)(отлично|супер|здорово|ура|поздравляем|вуаля)(?![а-яё])/i;

/** [field, text] for every visible string the data module renders. */
export function visibleTexts(article) {
  const out = [
    ["title", article.title], ["seoTitle", article.seoTitle], ["description", article.description],
    ["question", article.question], ["hero.alt", article.hero.alt], ["hero.caption", article.hero.caption],
    ...article.intro.map((paragraph, i) => [`intro[${i}]`, partText(paragraph)]),
    ...(article.summary ?? []).map((text, i) => [`summary[${i}]`, text]),
  ];
  const sections = [...article.partOne.map((s, i) => [`partOne[${i}]`, s]), ...article.partTwo.map((s, i) => [`partTwo[${i}]`, s])];
  for (const [field, section] of sections) {
    out.push([`${field}.heading`, section.heading]);
    section.paragraphs.forEach((p, i) => out.push([`${field}.paragraphs[${i}]`, partText(p)]));
    (section.subsections ?? []).forEach((sub, j) => {
      out.push([`${field}.subsections[${j}].heading`, sub.heading]);
      sub.paragraphs.forEach((p, i) => out.push([`${field}.subsections[${j}].paragraphs[${i}]`, partText(p)]));
    });
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
    ...article.intro,
    ...[...article.partOne, ...article.partTwo].flatMap((s) => [...s.paragraphs, ...(s.subsections ?? []).flatMap((sub) => sub.paragraphs)]),
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

// ── Tone (Sergey, 30.10.2026): warm and explanatory like the reference, not a list of orders ──────
// Imperatives live mainly in step titles and checklist items; the author prose explains «why» first and
// suggests gently («удобно», «можно», «поможет»). Measured on authorProse(), not on headings or lists.
export const TONE = {
  /** Imperatives per 1000 words of author prose: a warning above `warn`, a stronger warning above `error` (key name kept; no tone error). */
  imperativesPer1000: { warn: 20, error: 25 },
  /** Share of sentences that open with an imperative («Проверьте…», «Не ставьте…»). */
  imperativeStartShare: { warn: 0.15, error: 0.3 },
  /** Explanatory sentences (no imperative at all): at least this share. */
  explanatoryShareMin: 0.65,
  /** Канцелярит: every hit is a warning; the published set keeps it at or below this per 1000 words. */
  kanceliaritPer1000: 4,
};
// Plural «вы»-imperative: -йте/-ите/-ьте (+ reflexive -сь). A heuristic that leans to missing a request rather
// than flagging good prose (decision 30.10.2026, PR #1092): -ите is also the present tense («вы готовите», «видите
// весь зал»), so after «вы» it counts as a statement: «вы» earlier in the sentence or anywhere in the same clause
// («За сроками следите вы сами»); a «вы» in a later clause leaves the request («посмотрите, встречаетесь ли вы…»).
// «на сайте», «в новом буклете» are nouns after a preposition. Known misses: scripts/writer/README.md («Тон:
// известные ограничения»).
const IMPERATIVE_FORM = /^[а-яё]{2,}(?:йте|ите|ьте)(?:сь)?$/;
const NOT_IMPERATIVE = new Set(["сайте", "кредите", "лимите", "дефиците", "аппетите", "бите", "ките", "граните", "элите", "свите", "орбите", "визите", "транзите", "депозите", "профите", "минимуме"]);
const NOT_AFTER = new Set(["вы", "в", "во", "на", "о", "об", "обо", "при", "по"]);
const sentenceWords = (sentence) => norm(sentence).match(/[а-яё]+/g) ?? [];
/** Indexes of imperative verbs among the words of one sentence. */
export function imperativeIndexes(sentence) {
  const list = sentenceWords(sentence);
  // Clause number of every word (split at , ; : ( ) and dashes): «вы» later in another clause («посмотрите,
  // встречаетесь ли вы взглядом») does not make an earlier -ите a statement.
  const clauseOf = norm(sentence).split(/[,;:()\u2013\u2014]/).flatMap((part, c) => (part.match(/[а-яё]+/g) ?? []).map(() => c));
  const vyBefore = (i) => list.slice(0, i).includes("вы") || list.some((w, k) => w === "вы" && k > i && clauseOf[k] === clauseOf[i]);
  const out = [];
  list.forEach((word, i) => {
    if (!IMPERATIVE_FORM.test(word) || NOT_IMPERATIVE.has(word)) return;
    const prev = list[i - 1];
    // «на сайте», «в кредите», «в новом буклете»: a noun after a preposition (and an adjective); «вы делайте» is not
    // addressed as a request.
    if (NOT_AFTER.has(prev)) return;
    if (NOT_AFTER.has(list[i - 2]) && /(?:ом|ем|ём|ой|ей)$/.test(prev ?? "")) return;
    if (/ите(?:сь)?$/.test(word) && vyBefore(i)) return;
    out.push(i);
  });
  return out;
}
/** «Не …йте»: a prohibition addressed to the reader («Не приравнивайте», «не ставьте»). Heuristic, a warning only. */
export function prohibitions(text) {
  const found = [];
  for (const sentence of sentences(text)) {
    const list = sentenceWords(sentence);
    for (const i of imperativeIndexes(sentence)) if (list[i - 1] === "не") found.push(`не ${list[i]}`);
  }
  return found;
}
// Bureaucratic wording that reads like a regulation, not like a colleague.
export const KANCELIARIT = /(^|[^а-яё])(осуществл[а-яё]*|являет(?:ся|ь)|являются|данн(?:ый|ого|ому|ой|ом|ую|ое)|в рамках|в целях|в связи с|в соответствии|применительно|надлежащ[а-яё]*|вышеуказанн[а-яё]*|вышеперечисленн[а-яё]*|нижеследующ[а-яё]*|посредством|на предмет|по факту|в части|в случае|при наличии|при отсутствии|имеет место|в настоящее время|в обязательном порядке|производится|обеспечени[а-яё]*|соответствующ[а-яё]*|с целью)(?![а-яё])/gi;
export function kanceliarit(text) {
  return [...String(text).matchAll(KANCELIARIT)].map((m) => m[2].toLowerCase());
}
/**
 * [field, text] of the author's running prose: intro, sections, table intro/after, expert lead/after,
 * steps intro and texts, FAQ answers, checklist note. Headings, step titles, checklist items, table cells,
 * questions and quotes/translations are not prose (step titles and checklist items may stay imperative).
 */
export function authorProse(article) {
  return visibleTexts(article).filter(([field]) => /^intro\[|\.paragraphs\[|^table\.(intro|after)$|\.(lead|after)$|^steps\.intro$|^steps\.items\[\d+\]\.text$|^faq\[\d+\]\.answer$|^checklist\.(note|doneNote)$/.test(field));
}
/** The text opens with an imperative («Посчитайте…», «Не ставьте…»). */
/** Step titles start with an infinitive: «Посчитать», «Провести», «Зайти», «Беречь», «Договориться». */
export function startsInfinitive(text) {
  const first = String(text).trim().split(/[\s,.:;!?«»()–-]+/)[0]?.toLowerCase() ?? "";
  return /(ть|ти|чь)(ся)?$/.test(first);
}

export function startsImperative(text) {
  const idx = imperativeIndexes(text);
  const list = sentenceWords(text);
  return idx.includes(0) || (list[0] === "не" && idx.includes(1));
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
/** The article's own dates in the forms a reader would see: 2026-10-30, 30.10.2026, 30 октября 2026. */
export function visibleDateForms(article) {
  return [article.publishedAt, article.updatedAt].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date ?? "")).flatMap((date) => {
    const [y, m, d] = date.split("-");
    return [date, `${d}.${m}.${y}`, `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`];
  });
}

/** Tone metrics of a list of [field, text] (authorProse by default). */
export function toneMetrics(texts) {
  let total = 0, imperatives = 0, imperativeStarts = 0, explanatory = 0, wordCount = 0;
  const bans = [];
  const kanc = [];
  for (const [field, text] of texts) {
    wordCount += words(text);
    for (const sentence of sentences(text)) {
      if (!/[а-яё]/i.test(sentence)) continue;
      total += 1;
      const idx = imperativeIndexes(sentence);
      imperatives += idx.length;
      const list = sentenceWords(sentence);
      if (idx.includes(0) || (list[0] === "не" && idx.includes(1))) imperativeStarts += 1;
      if (!idx.length) explanatory += 1;
    }
    for (const ban of prohibitions(text)) bans.push([field, ban]);
    for (const hit of kanceliarit(text)) kanc.push([field, hit]);
  }
  const per1000 = (n) => (wordCount ? Math.round((n * 10000) / wordCount) / 10 : 0);
  const share = (n) => (total ? Math.round((n * 1000) / total) / 1000 : 0);
  return {
    words: wordCount, sentences: total, imperatives, imperativesPer1000: per1000(imperatives),
    imperativeStarts, imperativeStartShare: share(imperativeStarts), explanatoryShare: share(explanatory),
    prohibitions: bans, kanceliarit: kanc, kanceliaritPer1000: per1000(kanc.length),
  };
}
/**
 * Tone problems by TONE thresholds: [severity, field, message]. The imperative detector is a heuristic, so EVERY tone
 * check (density, imperative starts, «Не …йте/…ьте/…ите», explanatory share, канцелярит) is a warning for the Codex
 * polish pass (PR body) – a tone check never produces an error (decision 30.10.2026, PR #1092). Expert rotation and
 * quote reuse (rotationProblems) stay errors.
 */
export function toneProblems(article) {
  const m = toneMetrics(authorProse(article));
  const out = [];
  const T = TONE;
  if (m.imperativesPer1000 > T.imperativesPer1000.error) out.push(["warning", "tone", `повелительных глаголов ${m.imperativesPer1000} на 1000 слов (> ${T.imperativesPer1000.error}) – объясняйте «почему» и предлагайте мягко («удобно», «можно», «поможет»), приказы оставьте заголовкам шагов и чек-листу`]);
  else if (m.imperativesPer1000 > T.imperativesPer1000.warn) out.push(["warning", "tone", `повелительных глаголов ${m.imperativesPer1000} на 1000 слов (цель ≤ ${T.imperativesPer1000.warn})`]);
  const pct = (x) => `${Math.round(x * 100)}%`;
  if (m.imperativeStartShare > T.imperativeStartShare.error) out.push(["warning", "tone", `${pct(m.imperativeStartShare)} предложений начинаются с повелительного глагола (> ${pct(T.imperativeStartShare.error)})`]);
  else if (m.imperativeStartShare > T.imperativeStartShare.warn) out.push(["warning", "tone", `${pct(m.imperativeStartShare)} предложений начинаются с повелительного глагола (цель ≤ ${pct(T.imperativeStartShare.warn)})`]);
  for (const [field, ban] of m.prohibitions) out.push(["warning", field, `запрет «${ban}…» – вместо «Не …йте» объясните, как удобнее, и почему (проверьте при доводке: «-ите» бывает настоящим временем)`]);
  if (m.explanatoryShare < T.explanatoryShareMin) out.push(["warning", "tone", `объясняющих предложений ${pct(m.explanatoryShare)} (цель ≥ ${pct(T.explanatoryShareMin)})`]);
  if (m.kanceliarit.length) out.push(["warning", "tone", `канцелярит ${m.kanceliaritPer1000} на 1000 слов (цель ≤ ${T.kanceliaritPer1000}): ${[...new Set(m.kanceliarit.map(([, w]) => w))].join(", ")} – пишите проще, как коллега`]);
  return out;
}

// ── Expert rotation (Sergey, 30.10.2026): fresh people in every set, no quote twice on the site ──────
export const quoteKey = (expertId, quoteIndex) => `${expertId}#${quoteIndex}`;
/**
 * env.siteQuotes: Map quoteKey → slug of a published article outside this pack that already shows it;
 * env.packExperts: Map expertId → slug of an earlier article of the same pack.
 */
export function rotationProblems(article, env = {}) {
  const out = [];
  for (const key of ["expertOne", "expertTwo"]) {
    const slot = article[key];
    if (!slot?.expertId) continue;
    const onSite = env.siteQuotes?.get(quoteKey(slot.expertId, slot.quoteIndex));
    if (onSite && onSite !== article.slug) out.push([key, `цитата ${slot.expertId} №${slot.quoteIndex} уже есть на сайте (/b/coffee/${onSite}) – одна цитата выходит на сайте один раз, возьмите другую из реестра`]);
    const inPack = env.packExperts?.get(slot.expertId);
    if (inPack && inPack !== article.slug) out.push([key, `эксперт ${slot.expertId} уже есть в этом пакете (${inPack}) – в наборе каждый эксперт один раз`]);
  }
  if (article.expertOne?.expertId && article.expertOne.expertId === article.expertTwo?.expertId) out.push(["expertTwo", "два слота одного эксперта"]);
  return out;
}

// ── Retro of sets 2–7 (01.11.2026): what Codex fixed by hand in 30 drafts, made machine-checkable ─────
// Errors only where the text is unambiguously wrong; style patterns stay warnings for the polish pass.

/** Service words of the pipeline that leaked into the page: «бриф», «в источниках не дано» – errors (never «брифинг»). */
export const SERVICE_WORDS = [
  /(^|[^а-яё])бриф(?:а|е|у|ом|ы|ов|ам|ами|ах)?(?![а-яё])/i,
  /в источник(?:ах|е) (?:не|нет)(?![а-яё])/i,
];
/** «набор №3» is usually the generation batch, but can be tableware – a warning. */
export const SERVICE_WORDS_WARN = [/(^|[^а-яё])набор[а-яё]* №/i];
/** City names written in lowercase (the query is lowercase, the page is not): «в москве», «спб». */
export const LOWERCASE_CITY = /(^|[^а-яёА-ЯЁ])(москв(?:а|е|у|ы|ой|ою)|спб|петербург(?:а|е|у|ом)?)(?![а-яё])/;
/** A markdown link the assembler could not parse is printed as is: «[анкор]( /b/…)». */
export const RAW_MARKDOWN = /\[[^\]]*\]\s*\(|\]\(/;
const QUESTION_LABEL = /^(?:как|что|чем|какой|какая|какое|какие|какую|каким|сколько|где|зачем|почему|когда|куда|нужн[а-яё]* ли|можно ли|стоит ли)(?![а-яё])/i;
const PREPOSITION_END = /(?:^|[^а-яё])(?:с|со|в|во|на|про|о|об|обо|к|ко|по|из|для|у|от|за|при|без|до|под|над|перед|между)\s*$/i;
const ABOUT_THAT_END = /о\s+том,?\s*$/i;
const richParagraphs = (article) => [
  ...article.intro.map((p, i) => [`intro[${i}]`, p]),
  ...[...article.partOne.map((s, i) => [`partOne[${i}]`, s]), ...article.partTwo.map((s, i) => [`partTwo[${i}]`, s])].flatMap(([field, s]) => [
    ...s.paragraphs.map((p, i) => [`${field}.paragraphs[${i}]`, p]),
    ...(s.subsections ?? []).flatMap((sub, j) => sub.paragraphs.map((p, i) => [`${field}.subsections[${j}].paragraphs[${i}]`, p])),
  ]),
  ...article.table.intro.map((p) => ["table.intro", p]), ...article.table.after.map((p) => ["table.after", p]),
  ...["expertOne", "expertTwo"].flatMap((key) => [...article[key].lead.map((p) => [`${key}.lead`, p]), ...article[key].after.map((p) => [`${key}.after`, p])]),
];

/**
 * Link anchors that break the sentence (retro 2–7: 34 in raw drafts, the most frequent link fix):
 * a question-like title as an anchor – «сверить с [что нужно для открытия]». Warnings only: «зависит от того,
 * в [какой чашке подают]» is valid Russian, so the check flags the pattern and the polish pass decides.
 */
export function linkGrammarProblems(article) {
  const out = [];
  for (const [field, paragraph] of richParagraphs(article)) {
    paragraph.forEach((part, k) => {
      if (typeof part === "string" || !QUESTION_LABEL.test(part.label.trim())) return;
      const before = typeof paragraph[k - 1] === "string" ? paragraph[k - 1] : "";
      if (ABOUT_THAT_END.test(before)) return;
      if (PREPOSITION_END.test(before)) out.push(["warning", field, `анкор-вопрос после предлога: «…${before.slice(-20)}[${part.label}]» – если фраза не читается, вопрос в анкоре только после «о том, …», иначе слова фразы в нужном падеже`]);
      else out.push(["warning", field, `анкор-вопрос «${part.label}» без «о том, …» – проверьте, что фраза читается`]);
    });
  }
  return out;
}

/** Expert formulas Codex rewrote in 27 of 30 drafts, and experts retold outside their slot. Warnings. */
export function expertSlotStyleProblems(article, experts) {
  const out = [];
  for (const key of ["expertOne", "expertTwo"]) {
    const slot = article[key];
    const lead = slot.lead.map(partText).join(" ");
    const after = slot.after.map(partText).join(" ");
    if (/отвеча[а-яё]* на вопрос/i.test(lead)) out.push([`${key}.lead`, "lead без формулы «отвечает на вопрос» – источник и тема разговора: «… в интервью … рассказывает о …»"]);
    if (/^\s*Для (?:вашей |вас и )?кофейн[а-яё]*[^.]{0,25}?(?:значит|означает)/i.test(after)) out.push([`${key}.after`, "after без зачина «Для кофейни это значит» – сразу конкретный вывод по теме"]);
    const expert = experts?.get(slot.expertId);
    if (!expert) continue;
    // Capitalised surname plus a short case ending: «Котова», «Шульцем» – never «которые».
    const surname = expert.name.split(/\s+/).pop().replace(/ё/g, "е");
    const stem = surname.length > 5 ? surname.slice(0, -1) : surname;
    const mention = new RegExp(`(^|[^А-ЯЁа-яё])${stem}[а-я]{0,3}(?![а-яё])`);
    const outside = visibleTexts(article).filter(([field]) => !/^(expertOne|expertTwo)\./.test(field) && !/^readMore/.test(field));
    const hit = outside.find(([, text]) => mention.test(String(text).replace(/ё/g, "е")));
    if (hit) out.push([hit[0], `${expert.name} упоминается вне блока эксперта – эксперт только в своём lead/after, в разделах его не пересказывают`]);
  }
  return out;
}

/**
 * @param article assembled VerticalGuideArticle
 * @param brief   normalized pack article (brief.mjs)
 * @param env     { experts: Map, repoDir?: string, avoid?: Set<string>, siteQuotes?: Map, packExperts?: Map }
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
    if (!/\.translation$/.test(field) && EXCLAMATORY.test(text)) error(field, `восклицательный тон («${String(text).match(EXCLAMATORY)[0].trim()}») – спокойный деловой тон, без «Отлично!» и восклицаний`);
    for (const slip of ordinalAgreementSlips(text)) error(field, `не согласовано: «${slip.text}» – существительное ${slip.noun} рода`);
    for (const re of SERVICE_WORDS) if (re.test(text)) { error(field, `служебное слово в тексте («${String(text).match(re)[0].trim()}…») – читатель не знает про бриф, источники и наборы`); break; }
    for (const re of SERVICE_WORDS_WARN) if (re.test(text)) { warn(field, `похоже на служебное слово («${String(text).match(re)[0].trim()}…») – если это номер набора статей, уберите`); break; }
    if (LOWERCASE_CITY.test(text)) error(field, `город со строчной буквы: «${String(text).match(LOWERCASE_CITY)[2]}» – «Москва», «СПб», «Петербург»`);
    if (RAW_MARKDOWN.test(text)) error(field, "неразобранная markdown-ссылка – формат строго [анкор](/b/coffee/…), без пробела после «(»");
  }

  // Intro: no opening story (owner rule 2026-10-30) – straight to the practical topic, query first.
  const intro = article.intro.map(partText);
  const introText = intro.join("\n");
  if (intro.length < L.intro[0] || intro.length > L.intro[1]) error("intro", `вступление – ${L.intro[0]}–${L.intro[1]} абзаца, сейчас ${intro.length}`);
  const introWords = words(introText);
  if (introWords < L.introWords[0] || introWords > L.introWords[1]) error("intro", `вступление – ${L.introWords[0]}–${L.introWords[1]} слов, сейчас ${introWords}`);
  if (!intro[0] || countQuery(intro[0], brief.primaryQuery) < 1) error("intro[0]", `первый абзац вступления содержит запрос «${brief.primaryQuery}»`);
  else if (!norm(intro[0]).startsWith(norm(brief.primaryQuery))) warn("intro[0]", `лучше начать первый абзац с запроса «${brief.primaryQuery}», как в эталоне`);
  if (dialogueLines(intro) > 0) error("intro", "во вступлении нет истории, диалогов и прямой речи – сразу к теме");
  if (FIRST_PERSON.test(introText)) error("intro", "вступление без рассказчика «я/мы» – статья не открывается историей");
  if (STORY_MARKERS.test(introText)) error("intro", `похоже на историю («${introText.match(STORY_MARKERS)[2]}») – статьи о кофейнях начинаются сразу с практической темы`);

  // «Коротко»: 3–5 short takeaways under the intro.
  const summary = article.summary ?? [];
  if (summary.length < L.summary[0] || summary.length > L.summary[1]) error("summary", `блок «Коротко» – ${L.summary[0]}–${L.summary[1]} пунктов, сейчас ${summary.length}`);
  for (const [i, item] of summary.entries()) {
    const n = words(item);
    if (n < L.summaryItemWords[0] || n > L.summaryItemWords[1]) warn(`summary[${i}]`, `пункт «Коротко» – ${L.summaryItemWords[0]}–${L.summaryItemWords[1]} слов, сейчас ${n}`);
  }

  // Dates and og image: markup only (owner rule 30.10.2026) – JSON-LD, OG meta and sitemap; never on the page.
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  for (const key of ["publishedAt", "updatedAt"]) if (!ISO.test(article[key] ?? "")) error(key, `${key} – дата ГГГГ-ММ-ДД для разметки`);
  if (ISO.test(article.publishedAt ?? "") && ISO.test(article.updatedAt ?? "") && article.updatedAt < article.publishedAt) error("updatedAt", "updatedAt не раньше publishedAt");
  for (const [field, text] of texts) {
    if (visibleDateForms(article).some((form) => String(text).includes(form)) || /(^|[^а-яё])(обновлено|опубликовано|дата публикации)(?![а-яё])/i.test(text)) error(field, "дата статьи в видимом тексте – даты только в разметке, на странице их нет");
  }
  const og = article.ogImage;
  if (!og || og.src !== COFFEE.ogSrc(article.slug) || og.width !== COFFEE.ogSize.width || og.height !== COFFEE.ogSize.height || !og.alt) error("ogImage", `ogImage – текстовая обложка ${COFFEE.ogSrc(article.slug)} ${COFFEE.ogSize.width}×${COFFEE.ogSize.height} с alt`);

  // No invented numbers or statistics: every claim must come from a brief fact with a named source.
  for (const [field, message] of ungroundedClaims(texts.filter(([f]) => !/^readMore|\.translation$/.test(f)), brief, env.experts)) error(field, message);

  // SEO.
  const q = brief.primaryQuery;
  if (article.seoTitle.length > L.seoTitleMax) error("seoTitle", `seoTitle ≤ ${L.seoTitleMax} символов, сейчас ${article.seoTitle.length}`);
  if (!norm(article.seoTitle).startsWith(norm(q))) error("seoTitle", `seoTitle начинается с «${q}»`);
  if (!/^[А-ЯЁ]/.test(article.seoTitle)) error("seoTitle", "seoTitle начинается с заглавной буквы");
  if (/(^|\D)(19|20)\d{2}(?!\d)/.test(article.seoTitle)) error("seoTitle", "seoTitle без года – статьи вечнозелёные, даты только в разметке");
  if (article.description.length < L.description[0] || article.description.length > L.description[1]) error("description", `description ${L.description[0]}–${L.description[1]} символов, сейчас ${article.description.length}`);
  if (!countQuery(article.description, q)) error("description", `description должна содержать запрос «${q}» дословно, в той же форме и падеже`);
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
  for (const [c, header] of article.table.columns.entries()) {
    if (!NUMERIC_COLUMN.test(header)) continue;
    const empty = article.table.rows.filter((row) => row[c] !== undefined && !/\d/.test(row[c]));
    if (empty.length) error("table.columns", `столбец «${header}» обещает цифры, но в ${empty.length} из ${article.table.rows.length} строк их нет – возьмите числа из фактов брифа или переименуйте столбец`);
  }
  for (const [i, row] of article.table.rows.entries()) {
    if (row.length !== cols) error(`table.rows[${i}]`, `в строке ${row.length} значений, столбцов ${cols}`);
    for (const cell of row) if (words(cell) > 25) warn(`table.rows[${i}]`, "длинное значение – на телефоне карточка станет тяжёлой");
  }
  if (article.steps.items.length !== 3) error("steps", "ровно 3 шага");
  // Steps and checklist without the imperative (SEO audit 30.10.2026): «Посчитать расход», «На пачке есть дата обжарки».
  for (const [i, item] of article.steps.items.entries()) {
    if (!startsInfinitive(item.title)) error(`steps.items[${i}].title`, `«${item.title}» – заголовок шага начинается с инфинитива, без повелительного наклонения («Посчитать расход», «Провести дегустацию»)`);
  }
  for (const [i, item] of article.checklist.items.entries()) if (startsImperative(item.text)) warn(`checklist.items[${i}]`, `«${item.text}» – пункт чек-листа готовым результатом («Объём заказа рассчитан…»), без повелительного наклонения`);
  if (!/^Три шага/.test(article.steps.heading)) warn("steps.heading", "заголовок обычно начинается с «Три шага»");
  if (article.checklist.items.length !== L.checklist) error("checklist", `ровно ${L.checklist} пунктов`);
  if (article.faq.length < L.faq[0] || article.faq.length > L.faq[1]) error("faq", `${L.faq[0]}–${L.faq[1]} вопросов`);
  for (const [i, item] of article.faq.entries()) {
    const n = words(item.answer);
    if (n < L.faqAnswerWords[0] || n > L.faqAnswerWords[1]) error(`faq[${i}]`, `ответ ${L.faqAnswerWords[0]}–${L.faqAnswerWords[1]} слов, сейчас ${n}`);
    if (!item.question.endsWith("?")) error(`faq[${i}]`, "вопрос заканчивается «?»");
    if (/^(?:Да|Нет)(?![а-яё])/.test(item.answer.trim())) warn(`faq[${i}]`, "ответ начинается с сути, а не с голого «Да»/«Нет» (так правили 22 ответа в наборах 2–7)");
  }
  for (const field of ["question", "finalQuestion"]) if (!String(article[field]).endsWith("?")) error(field, "вопрос заканчивается «?»");

  // Links: only from the brief, only allowed hosts; the page opens every one in a new tab.
  const allowed = new Set(brief.links);
  for (const link of textLinks(article)) {
    if (!isAllowedTextHref(link.href)) error("links", `запрещённая ссылка ${link.href} – только страницы audiolad.ru и MAX`);
    else if (!allowed.has(link.href)) error("links", `ссылки ${link.href} нет в брифе`);
  }
  for (const link of article.readMore) if (!isInternalHref(link.href)) error("readMore", `только внутренние ссылки: ${link.href}`);
  const used = new Set(textLinks(article).map((link) => link.href));
  if (brief.links.length && used.size === 0) warn("links", "в тексте нет ни одной ссылки из брифа");
  const guideLinks = [...used].filter((href) => href.startsWith(`${COFFEE.verticalPath}/`) && href.split(/[?#]/)[0] !== `${COFFEE.verticalPath}/${article.slug}`);
  if (guideLinks.length < L.textLinksMin) error("links", `в тексте не меньше ${L.textLinksMin} ссылок на разные статьи раздела, сейчас ${guideLinks.length}`);

  // Experts: registry, licensed portrait, Russian-only, pair man/woman and ru/foreign.
  for (const [i, key] of ["expertOne", "expertTwo"].entries()) {
    const slot = article[key];
    const briefSlot = brief.experts[i];
    if (slot.expertId !== briefSlot?.id) error(key, `эксперт должен быть ${briefSlot?.id}`);
    for (const message of expertSlotProblems({ id: slot.expertId, quoteIndex: slot.quoteIndex, translation: slot.translation }, env.experts, { repoDir: env.repoDir })) error(key, message);
    if (!slot.heading || !partText(slot.lead[0] ?? [])) error(key, "нужны heading и lead");
    const expert = env.experts?.get(slot.expertId);
    if (expert) {
      const surname = norm(expert.name.split(/\s+/).pop());
      const lead = norm(slot.lead.map(partText).join(" "));
      if (!lead.includes(surname.slice(0, Math.max(4, surname.length - 1)))) error(`${key}.lead`, `lead называет эксперта: «${expert.name} …», а не «эксперт ответил»`);
    }
  }

  for (const [field, message] of expertSlotStyleProblems(article, env.experts)) warn(field, message);

  // Link anchors that break the sentence.
  for (const [severity, field, message] of linkGrammarProblems(article)) (severity === "error" ? error : warn)(field, message);

  // Rotation: one expert once per set, one quote once on the site.
  for (const [field, message] of rotationProblems(article, env)) error(field, message);

  // Tone: warm and explanatory, not a list of orders.
  for (const [, field, message] of toneProblems(article)) warn(field, message);

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
