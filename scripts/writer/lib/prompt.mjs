// Prompt and strict JSON schema for «Райтер» (Cloud.ru Foundation Models).

const str = { type: "string" };
const strArray = { type: "array", items: str };

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
    object({ kind: { type: "string", enum: ["paragraph"] }, text: str }),
    object({
      kind: { type: "string", enum: ["rich_paragraph"] },
      segments: { type: "array", items: segment },
    }),
    object({ kind: { type: "string", enum: ["heading"] }, level: { type: "integer", enum: [3] }, title: str }),
    object({ kind: { type: "string", enum: ["list"] }, items: strArray }),
  ];
  if (tableAllowed) {
    blocks.push(
      object({
        kind: { type: "string", enum: ["table"] },
        caption: str,
        columns: strArray,
        rows: { type: "array", items: strArray },
      }),
    );
  }
  const blurbs = {};
  for (const practice of brief.relatedPractices) blurbs[practice.key] = str;
  return object({
    title: str,
    breadcrumbTitle: str,
    metaTitle: str,
    metaDescription: str,
    leadBeforeAudio: str,
    shortAnswer: str,
    primaryPracticeIntro: str,
    introAfterAudio: strArray,
    sections: {
      type: "array",
      items: object({ id: str, title: str, blocks: { type: "array", items: { anyOf: blocks } } }),
    },
    faq: { type: "array", items: object({ question: str, answer: str }) },
    closingSection: object({ paragraphs: strArray }),
    relatedPracticeBlurbs: object(blurbs),
    seeAlsoLinks: { type: "array", items: object({ href: str, title: str, description: str }) },
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
        `[${source.id}] ${source.title}${source.url ? ` – ${source.url}` : ""}`,
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
      ? `Дополнительные ключи (по 1 разу, естественно): ${brief.secondaryKeywords.map((k) => `«${k}»`).join(", ")}.`
      : null,
    `Объём основного текста: ${brief.wordCount.min}–${brief.wordCount.max} слов (без FAQ и метаданных).`,
    `Разделов (sections): ${brief.sections.min}–${brief.sections.max}; id разделов – латиница через дефис; в каждом разделе 2–5 блоков.`,
    `FAQ: ${brief.faq.min}–${brief.faq.max} вопросов, каждый вопрос заканчивается «?».`,
    `seeAlsoLinks: ${brief.seeAlso.min}–${brief.seeAlso.max} ссылок только из списка разрешённых статей /articles/…`,
    "metaTitle до 70 символов и заканчивается « – АудиоЛад»; metaDescription 120–170 символов; breadcrumbTitle до 45 символов.",
    "closingSection.paragraphs – 1–2 абзаца итога (раздел «Главное» добавится автоматически).",
    `Ссылка на основную практику ${brief.primaryPractice.href} обязательна хотя бы в одном rich_paragraph.`,
    `Минимум ${brief.minInternalArticleLinks} ссылки на разные статьи /articles/… в rich_paragraph (только из списка).`,
    tableAllowed
      ? `Таблица (block kind "table"): ${brief.table.mode === "required" ? "обязательна, ровно одна" : "по желанию, не больше одной"}; ${brief.table.columns ? `колонки: ${brief.table.columns.join(" | ")}` : "2–4 колонки"}; строк ${brief.table.rows.min}–${brief.table.rows.max}; у каждой строки столько ячеек, сколько колонок. ${brief.table.note}`
      : "Таблицы не использовать (блока table нет).",
    "Цитаты молитв и источников – только дословно из МАТЕРИАЛОВ, в «ёлочках», без изменения ни одной буквы и знака. Не цитируй то, чего нет в материалах.",
    "Никаких обещаний исцеления, излечения, защиты, гарантий результата, исполнения желаний; формулировки – о внимании, опоре, спокойствии.",
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
    "РАЗРЕШЁННЫЕ ВНЕШНИЕ ССЫЛКИ:",
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

export function buildRepairMessages(messages, previousArticle, errors) {
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
      json_schema: { name: "audiolad_practice_article", strict: true, schema },
    },
  };
}
