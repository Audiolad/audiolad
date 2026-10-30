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
export const NEGATIVE = [
  /дискомфорт/i, /неприятн/i, /неуютн/i, /раздраж/i, /стресс/i, /тревож/i, /тревог/i, /(^|[^а-яё])страх(?!ов)/i, /боит/i, /бояться/i,
  /стыд/i, /провал/i, /разочаров/i, /выгора/i, /кошмар/i, /паник/i, /ужас/i, /обидн/i, /беси/i, /злит/i,
];

const FIRST_PERSON = /(^|[^а-яё])(я|мне|меня|мной|мой|моя|моё|мои|мою|моей|мы|нам|нас|наш|наша|наше)(?![а-яё])/i;
// Capitalised words that may stand mid-sentence in a story without being a person's name.
const STORY_CAPS_OK = new Set(["Я", "Вы", "Вас", "Вам", "Ваш", "Ваша", "Ваше", "Ваши"]);

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
 * @param env     { experts: Map, storyCount: number, repoDir?: string, avoid?: Set<string> }
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
    if (/музык|трек|песн/i.test(text)) warn(field, "музыка в тексте статьи – по правилу владельца статья не про музыку и без плееров; проверьте на вычитке");
    for (const re of NEGATIVE) if (re.test(text)) { error(field, `негативная формулировка («${String(text).match(re)[0]}…») – правило: не настраивать на неприятный опыт`); break; }
  }

  // Opening story: first-person, dialogue, no names.
  const storyCount = env.storyCount ?? 0;
  const story = article.intro.slice(0, storyCount);
  const bridge = article.intro[storyCount] ?? "";
  if (storyCount < L.story[0] || storyCount > L.story[1]) error("story", `история – ${L.story[0]}–${L.story[1]} абзацев, сейчас ${storyCount}`);
  const storyText = story.join("\n");
  const storyWords = words(storyText);
  if (storyWords < L.storyWords[0] || storyWords > L.storyWords[1]) error("story", `история – ${L.storyWords[0]}–${L.storyWords[1]} слов, сейчас ${storyWords}`);
  if (!FIRST_PERSON.test(storyText)) error("story", "история от первого лица («я», «мне», «мы»)");
  const dialogue = dialogueLines(story);
  if (dialogue < L.dialogueLines) error("story", `в истории нужен диалог: не меньше ${L.dialogueLines} реплик прямой речи, сейчас ${dialogue}`);
  for (const [i, paragraph] of story.entries()) {
    const names = capitalisedMidSentence(paragraph).filter((w) => !STORY_CAPS_OK.has(w));
    if (names.length) error(`story[${i}]`, `похоже на имя или название: ${[...new Set(names)].join(", ")} – в истории без имён, кофеен и городов`);
  }
  for (const id of brief.experts.map((slot) => slot.id)) {
    const surname = env.experts.get(id)?.name?.split(" ").pop();
    if (surname && storyText.includes(surname)) error("story", `в истории упомянут эксперт ${surname}`);
  }
  if (!bridge || countQuery(bridge, brief.primaryQuery) < 1) error("bridge", `мостик после истории содержит запрос «${brief.primaryQuery}»`);

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
