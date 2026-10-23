// Prompt and strict JSON schema for «Райтер» (Cloud.ru Foundation Models).

const str = { type: "string" };
// Only array upper bounds go into the grammar: they stop runaway loops (seen in a pilot
// dry run: hundreds of empty blocks). Lower bounds are NOT enforced by the grammar, because
// forcing a model past the point where it wants to stop makes it emit whitespace until
// max_tokens; string maxLength cuts words in half. Lengths are requested in the prompt and
// checked by the validators instead.
const text = () => str;
const arrayOf = (items, _min, maxItems) => ({ type: "array", items, maxItems });

function object(properties) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export function articleSchema(brief, { tableAllowed }) {
  const segment = {
    anyOf: [
      object({ text: str }),
      object({ strong: str }),
      object({ href: str, label: str }),
    ],
  };
  const blocks = [
    object({ kind: { type: "string", enum: ["paragraph"] }, text: text(200) }),
    object({
      kind: { type: "string", enum: ["rich_paragraph"] },
      segments: arrayOf(segment, 2, 12),
    }),
    object({ kind: { type: "string", enum: ["heading"] }, level: { type: "integer", enum: [3] }, title: text(3) }),
    object({ kind: { type: "string", enum: ["list"] }, items: arrayOf(text(3), 2, 10) }),
  ];
  if (tableAllowed) {
    blocks.push(
      object({
        kind: { type: "string", enum: ["table"] },
        caption: str,
        columns: arrayOf(text(1), 2, 4),
        rows: arrayOf(arrayOf(text(1), 2, 4), brief.table.rows.min, brief.table.rows.max),
      }),
    );
  }
  const blurbs = {};
  for (const practice of brief.relatedPractices) blurbs[practice.key] = str;
  return object({
    title: text(20, 110),
    breadcrumbTitle: text(3, 45),
    metaTitle: text(25, 70),
    metaDescription: text(110, 170),
    leadBeforeAudio: text(80, 700),
    shortAnswer: text(80, 700),
    primaryPracticeIntro: text(30, 400),
    introAfterAudio: arrayOf(text(40), 1, 4),
    sections: arrayOf(
      object({ id: text(2, 60), title: text(3, 120), blocks: arrayOf({ anyOf: blocks }, 4, 12) }),
      brief.sections.min,
      brief.sections.max,
    ),
    faq: arrayOf(object({ question: text(10), answer: text(40) }), brief.faq.min, brief.faq.max),
    closingSection: object({ paragraphs: arrayOf(text(40), 1, 3) }),
    relatedPracticeBlurbs: object(blurbs),
    seeAlsoLinks: arrayOf(object({ href: str, title: str, description: str }), brief.seeAlso.min, brief.seeAlso.max),
  });
}

const SYSTEM = [
  "Ты – «Райтер», редактор русскоязычного медиа АудиоЛад (аудиопрактики, медитации, молитвы).",
  "Пишешь живые, точные, спокойные статьи без воды, эзотерических обещаний и рекламных преувеличений.",
  "Отвечаешь строго одним JSON-объектом без Markdown, без пояснений до или после.",
].join(" ");

function list(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function buildMessages(brief, context) {
  const tableAllowed = context.supportsTable && brief.table.mode !== "forbidden";
  const articleLinks = brief.internalLinks
    .map((link) => {
      const slug = link.href.match(/^\/articles\/([a-z0-9-]+)$/)?.[1];
      const known = slug ? context.articleBySlug.get(slug) : null;
      const title = known ? ` – «${known.title}»` : "";
      return `${link.href}${title}${link.note ? ` (${link.note})` : ""}`;
    });
  const practices = [brief.primaryPractice, ...brief.relatedPractices];
  const sources = brief.sources
    .map((source) =>
      [
        `[${source.id}] ${source.title}`,
        "<<<",
        source.text,
        ">>>",
      ].join("\n"),
    )
    .join("\n\n");

  const requirements = [
    `Тип статьи: practice. Тема: ${brief.topic}.`,
    `Интент и позиционирование: ${brief.intent}`,
    brief.audience ? `Аудитория: ${brief.audience}` : null,
    `Главный ключ: «${brief.primaryKeyword}». Он должен стоять в title, metaTitle и metaDescription и 1–3 раза в тексте, без переспама.`,
    brief.secondaryKeywords.length
      ? `Дополнительные ключи (по 1 разу, естественно; можно склонять и менять лицо, текст должен оставаться грамматически правильным): ${brief.secondaryKeywords.map((k) => `«${k}»`).join(", ")}.`
      : null,
    `Объём основного текста (leadBeforeAudio + introAfterAudio + sections + closingSection, без FAQ и метаданных): ${brief.wordCount.min}–${brief.wordCount.max} слов. Это жёсткое требование: короче ${brief.wordCount.min} слов статья не принимается. Ориентир – ${Math.round(brief.wordCount.min * 7.5)}–${Math.round(brief.wordCount.max * 7)} знаков основного текста; лучше чуть длиннее минимума, чем короче.`,
    `Разделов (sections): ${brief.sections.min}–${brief.sections.max}; id разделов – латиница через дефис; в каждом разделе 4–7 содержательных блоков и около ${Math.ceil((brief.wordCount.min + 150) / brief.sections.min)} слов; абзацы по 50–100 слов, без пустых и повторяющихся блоков.`,
    `FAQ: ${brief.faq.min}–${brief.faq.max} вопросов, каждый вопрос заканчивается «?».`,
    `seeAlsoLinks: ${brief.seeAlso.min}–${brief.seeAlso.max} ссылок только из списка разрешённых статей /articles/…`,
    "metaTitle до 70 символов и заканчивается « – АудиоЛад»; metaDescription 120–170 символов; breadcrumbTitle до 45 символов.",
    "closingSection.paragraphs – 1–2 абзаца итога (раздел «Главное» добавится автоматически).",
    `Ссылка на основную практику ${brief.primaryPractice.href} обязательна хотя бы в одном rich_paragraph.`,
    "Практики называй точно так, как в их title выше, в «ёлочках»; другие названия не придумывай.",
    "Между текстовым сегментом и ссылкой ставь пробел внутри text (\"попробуйте \", затем ссылка). Числовые диапазоны – через «–»: 5–10 минут.",
    `Минимум ${brief.minInternalArticleLinks} ссылки на разные статьи /articles/… в rich_paragraph (только из списка).`,
    tableAllowed
      ? `Таблица (block kind "table"): ${brief.table.mode === "required" ? "обязательна, ровно одна" : "по желанию, не больше одной"}; ${brief.table.columns ? `колонки: ${brief.table.columns.join(" | ")}` : "2–4 колонки"}; строк ${brief.table.rows.min}–${brief.table.rows.max}; у каждой строки столько ячеек, сколько колонок. ${brief.table.note}`
      : "Таблицы не использовать (блока table нет).",
    "Цитаты молитв и источников – только дословно из МАТЕРИАЛОВ, в «ёлочках», без изменения ни одной буквы и знака. Не цитируй то, чего нет в материалах.",
    "Никаких обещаний исцеления, излечения, защиты, гарантий результата, исполнения желаний; формулировки – о внимании, опоре, спокойствии.",
    "Практики описывай только через хорошее: поддержка, доверие, спокойствие, тепло. Не пиши про дискомфорт, неприятные ощущения, тревогу во время практики, «если станет плохо», «остановите/прекратите запись (прослушивание, практику)» – это настраивает человека на дискомфорт. Практичный совет можно дать позитивно: «слушайте в спокойной обстановке, не за рулём».",
    "Не выдумывай фактов, дат, статистики, имён, цен, функций сайта. Используй только факты из брифа и материалов.",
    "Типографика: только короткое тире «–» (никогда длинное тире U+2014), кавычки «ёлочки», буква ё, обычный дефис «-» в словах. Бренд пишется «АудиоЛад».",
    "Без HTML и Markdown внутри строк. Ссылки – только сегментами {href, label} в rich_paragraph.",
    ...brief.extraInstructions,
    ...brief.forbiddenPhrases.map((phrase) => `Запрещено использовать: «${phrase}».`),
  ].filter(Boolean);

  const user = [
    "Напиши статью для раздела «Статьи» сайта АудиоЛад по брифу.",
    "",
    "ТРЕБОВАНИЯ:",
    list(requirements),
    "",
    "ПРАКТИКИ (описания проверены, не добавляй свойств, которых здесь нет):",
    list(practices.map((p) => `${p.href} – «${p.title}»: ${p.description}`)),
    "",
    "РАЗРЕШЁННЫЕ ВНУТРЕННИЕ ССЫЛКИ (кроме практик выше других нет):",
    list(articleLinks.length ? articleLinks : ["(нет)"]),
    "",
    "ВНЕШНИЕ ССЫЛКИ: ссылки на любые другие сайты запрещены. Можно ссылаться только на audiolad.ru (статьи и практики выше) и на sergey-zoya.ru, и только на адреса из списка ниже. Источники (книги, исследования, сайты) называй обычным текстом, без ссылки и без адреса.",
    list(brief.externalLinks.length ? brief.externalLinks : ["(нет – внешние ссылки не ставить)"]),
    "",
    "ПРОВЕРЕННЫЕ ФАКТЫ:",
    list(brief.facts.length ? brief.facts : ["(нет)"]),
    "",
    "МАТЕРИАЛЫ (дословные тексты между <<< и >>>):",
    sources || "(нет – цитат не приводить)",
    "",
    "ФОРМАТ ОТВЕТА – один JSON-объект с полями:",
    "title, breadcrumbTitle, metaTitle, metaDescription, leadBeforeAudio (1–3 предложения), shortAnswer (короткий ответ 2–4 предложения),",
    "primaryPracticeIntro (1–2 предложения перед плеером основной практики), introAfterAudio (1–3 абзаца),",
    'sections: [{id, title, blocks: [{kind:"paragraph",text} | {kind:"rich_paragraph",segments:[{text}|{strong}|{href,label}]} | {kind:"heading",level:3,title} | {kind:"list",items}' +
      (tableAllowed ? ' | {kind:"table",caption,columns,rows}' : "") +
      "]}],",
    "faq: [{question, answer}], closingSection: {paragraphs}, relatedPracticeBlurbs: {" +
      brief.relatedPractices.map((p) => `"${p.key}": "1 предложение"`).join(", ") +
      "}, seeAlsoLinks: [{href, title, description}].",
  ].join("\n");

  return { messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }], tableAllowed };
}

export function buildRepairMessages(messages, previousArticle, errors, stats = {}) {
  const hints = [];
  if (errors.some((e) => e.startsWith("объём основного текста")) && stats.words) {
    hints.push(`Сейчас в основном тексте ${stats.words} слов: допиши содержательные абзацы в разделы, чтобы попасть в диапазон.`);
  }
  hints.push("Сохрани все ссылки {href, label} (на практики и статьи) и все дословные цитаты.");
  return [
    ...messages,
    { role: "assistant", content: JSON.stringify(previousArticle) },
    {
      role: "user",
      content: [
        "Автоматический валидатор нашёл ошибки. Исправь только их, остальной текст сохрани.",
        "Верни полный исправленный JSON того же формата, без пояснений.",
        "",
        "ОШИБКИ:",
        list(errors),
        "",
        ...hints,
      ].join("\n"),
    },
  ];
}

export function buildRequest(model, messages, schema, options = {}) {
  return {
    model,
    messages,
    max_tokens: options.maxTokens ?? 16000,
    temperature: options.temperature ?? 0.4,
    stream: false,
    response_format: {
      type: "json_schema",
      json_schema: { name: options.schemaName ?? "audiolad_practice_article", strict: true, schema },
    },
  };
}

// --- Expansion -------------------------------------------------------------------------
// gpt-oss tends to stop well below the requested length, and a full rewrite ("repair") rarely
// grows the text. So, when the first draft is too short, one extra call asks only for new
// plain paragraphs per section; they are merged deterministically and then validated as usual.
export const EXPAND_MAX_PARAGRAPHS = 3;

export function expandSchema(brief) {
  return object({
    additions: arrayOf(
      object({ sectionIndex: { type: "integer" }, paragraphs: arrayOf(str, 0, EXPAND_MAX_PARAGRAPHS) }),
      0,
      brief.sections.max,
    ),
  });
}

export function buildExpandMessages(brief, article, words) {
  const missing = Math.max(0, brief.wordCount.min + 120 - words);
  const outline = (article.sections ?? []).map((section, index) => `${index}. ${section?.title ?? ""}`).join("\n");
  const user = [
    `Статья ниже слишком короткая: ${words} слов в основном тексте, нужно не меньше ${brief.wordCount.min}.`,
    `Допиши примерно ${missing} слов новыми абзацами в разделы (sectionIndex – номер раздела из списка).`,
    `Каждый абзац 60–100 слов, по делу, без повторов уже сказанного и без воды. Не больше ${EXPAND_MAX_PARAGRAPHS} абзацев на раздел.`,
    "Только обычный текст: без ссылок, без цитат в кавычках, без обещаний лечения и гарантированного результата, без длинного тире (U+2014) – только «–».",
    "Пиши на «вы», тем же тоном, что и статья.",
    "",
    "РАЗДЕЛЫ:",
    outline,
    "",
    "СТАТЬЯ (JSON):",
    JSON.stringify(article),
  ].join("\n");
  return [{ role: "system", content: SYSTEM }, { role: "user", content: user }];
}

export function mergeExpansion(article, expansion, { maxBlocks = 12 } = {}) {
  const merged = structuredClone(article);
  let added = 0;
  for (const addition of expansion?.additions ?? []) {
    const section = merged.sections?.[addition?.sectionIndex];
    if (!section || !Array.isArray(section.blocks)) continue;
    for (const paragraph of addition.paragraphs ?? []) {
      if (typeof paragraph !== "string" || !paragraph.trim() || section.blocks.length >= maxBlocks) continue;
      section.blocks.push({ kind: "paragraph", text: paragraph.trim() });
      added += 1;
    }
  }
  return { article: merged, added };
}
