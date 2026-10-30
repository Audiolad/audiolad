// Prompt and strict JSON schema for AudioLad coffee guides. The model writes ONLY texts; the page
// (GuideArticleView) adds header, byline, four-cups slider, atlas banners, expert quotes and
// portraits, MAX button and «Читайте также» from the brief.
import { COFFEE } from "./config.mjs";
import { LESSONS, corrections, toneSample } from "./knowledge.mjs";

const str = { type: "string" };
const arrayOf = (items, maxItems) => ({ type: "array", items, maxItems });
function object(properties) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}
const section = () => object({ heading: str, paragraphs: arrayOf(str, 4) });
const expertSlot = () => object({ heading: str, lead: str, after: str });

export function coffeeArticleSchema() {
  return object({
    seoTitle: str,
    description: str,
    intro: arrayOf(str, 3),
    question: str,
    partOne: arrayOf(section(), 2),
    table: object({
      heading: str,
      intro: str,
      caption: str,
      columns: arrayOf(str, 4),
      rows: arrayOf(arrayOf(str, 4), 6),
      after: str,
    }),
    partTwo: arrayOf(section(), 3),
    expertOne: expertSlot(),
    expertTwo: expertSlot(),
    steps: object({ heading: str, intro: str, items: arrayOf(object({ title: str, text: str }), 3) }),
    checklist: object({ title: str, items: arrayOf(str, 5), note: str, doneNote: str }),
    faq: arrayOf(object({ question: str, answer: str }), 7),
    finalQuestion: str,
    heroAlt: str,
  });
}

const SYSTEM = () => [
  `Ты – автор раздела «${COFFEE.byline}» на audiolad.ru: практичные статьи для владельца кофейни. Пишешь по-русски, на «вы», тепло, ясно и по делу, без рекламы марок.`,
  "Верни только JSON по схеме, без пояснений.",
  "",
  "ПРАВИЛА ВЛАДЕЛЬЦА (обязательно):",
  ...LESSONS.map((lesson) => `- ${lesson}`),
  "",
  "ОШИБКИ ИЗ ВЫЧИТОК – «неверно → верно»:",
  ...corrections().map((item) => `- ${item}`),
].join("\n");

const bullets = (items) => items.filter(Boolean).map((item) => `- ${item}`).join("\n");

export function buildCoffeeMessages(brief, { experts, avoid = [] } = {}) {
  const L = COFFEE.limits;
  const q = brief.primaryQuery;
  const expertLines = brief.experts.map((slot, i) => {
    const expert = experts.get(slot.id);
    const quote = expert.quotes[slot.quoteIndex];
    return [
      `${i + 1}. ${expert.name} – ${expert.role}. ${expert.origin === "ru" ? "Русскоязычный эксперт." : "Иностранный эксперт, цитата выйдет в русском переводе."}`,
      `   Цитата (вставит сайт): «${slot.translation ?? quote.text}»`,
      `   Источник: ${quote.sourceLabel}.`,
      `   Контекст: ${quote.context}`,
    ].join("\n");
  });
  const user = [
    `СТАТЬЯ: «${brief.title}» (H1 уже задан). Основной запрос: «${q}».`,
    brief.intent && `Намерение читателя: ${brief.intent}`,
    "",
    "СТРУКТУРА (поля JSON, в порядке страницы):",
    `- seoTitle: ≤ ${L.seoTitleMax} символов, начинается с «${q}» (с заглавной), без названия сайта.`,
    `- description: ${L.description[0]}–${L.description[1]} символов, законченная фраза, содержит «${q}».`,
    `- intro: ${L.intro[0]}–${L.intro[1]} абзаца вступления, всего ${L.introWords[0]}–${L.introWords[1]} слов. Сразу к практической теме: первый абзац начинается с запроса «${q}» как есть (с заглавной) и объясняет, о чём речь и зачем это кофейне; следующий – что читатель найдёт в статье. Без истории, без диалогов и прямой речи, без рассказчика «я» и выдуманных героев.`,
    "- question: короткий вопрос к читателю со «?» – подпись над каруселью «Четыре чашки» (какая чашка похожа на вашу кофейню).",
    `- partOne: ровно 2 раздела {heading, paragraphs: ${L.sectionParagraphs[0]}–${L.sectionParagraphs[1]} абзаца по 40–90 слов}. Хотя бы один heading содержит «${q}». Между разделами сайт поставит баннер атласа.`,
    `- table: heading, intro (1 абзац), caption (подпись с запросом), columns (${L.tableColumns[0]}–${L.tableColumns[1]}), rows (${L.tableRows[0]}–${L.tableRows[1]} строк, в каждой столько значений, сколько колонок; значения короткие – на телефоне строка станет карточкой), after (1 абзац).`,
    "- partTwo: ровно 3 раздела, как partOne. Между ними сайт поставит эксперта 1, баннер «10 кофеен» и эксперта 2.",
    "- expertOne / expertTwo: heading – заголовок карточки; lead – 1–2 предложения: на какой вопрос отвечал эксперт (из контекста); after – 1–2 предложения: что это значит для кофейни. Порядок как в списке экспертов ниже.",
    "- steps: heading «Три шага, чтобы …», intro (1 абзац), items – ровно 3 {title – глагол в повелительном наклонении, text – 30–70 слов}.",
    `- checklist: title, items – ровно ${L.checklist} коротких действий глаголом; note – подпись под списком; doneNote – тёплая фраза, когда всё отмечено.`,
    `- faq: ${L.faq[0]}–${L.faq[1]} вопросов, ответы ${L.faqAnswerWords[0]}–${L.faqAnswerWords[1]} слов.`,
    "- finalQuestion: короткий вопрос со «?» над финальной картинкой с четырьмя чашками.",
    `- heroAlt: описание картинки «четыре чашки» (светлая кружка, зелёный стакан, фарфор с золотом, голубая керамика), начинается с «${q}».`,
    "",
    `ОБЪЁМ: вся статья ${L.totalWords[0]}–${L.totalWords[1]} слов; запрос «${q}» всего ${L.queryCount[0]}–${L.queryCount[1]} раз, без переспама.`,
    "",
    brief.links.length
      ? `ССЫЛКИ: в абзацы разделов вставь 2–4 ссылки [анкор](адрес) ТОЛЬКО на эти адреса:\n${bullets(brief.links)}`
      : "ССЫЛКИ: в тексте ссылок нет.",
    "",
    "ЭКСПЕРТЫ:",
    ...expertLines,
    "",
    brief.facts.length
      ? `ФАКТЫ (цифры, даты и исследования – только отсюда; источник называй словами в том же абзаце):\n${bullets(brief.facts)}`
      : "ФАКТОВ В БРИФЕ НЕТ: никаких цифр статистики, процентов, дат и «исследования показывают». Допустим только пример расчёта, начатый с «например».",
    brief.sectionsHint.length && `РАЗДЕЛЫ (идеи):\n${bullets(brief.sectionsHint)}`,
    brief.tableHint && `ТАБЛИЦА (идея): ${brief.tableHint}`,
    brief.forbiddenPhrases.length && `НЕ ИСПОЛЬЗУЙ:\n${bullets(brief.forbiddenPhrases)}`,
    "",
    "ОБРАЗЕЦ ТОНА (фрагменты утверждённой статьи «Кофе в зёрнах для кофейни»; бери интонацию, не копируй текст):",
    JSON.stringify(toneSample(), null, 1),
    avoid.length ? `\nНЕ ПОВТОРЯЙ заголовки и вопросы (уже есть в разделе или в других статьях пакета):\n${bullets(avoid.slice(0, 80))}` : "",
  ].filter((line) => typeof line === "string").join("\n");
  return [{ role: "system", content: SYSTEM() }, { role: "user", content: user }];
}

export function buildCoffeeRepairMessages(messages, previous, problems) {
  const errors = problems.filter((problem) => problem.severity === "error");
  return [
    ...messages,
    { role: "assistant", content: JSON.stringify(previous) },
    {
      role: "user",
      content: [
        "Автоматическая проверка нашла ошибки. Исправь только их, остальной текст и ссылки сохрани.",
        "Верни полный исправленный JSON того же формата, без пояснений.",
        "",
        "ОШИБКИ (поле → ошибка):",
        ...errors.map((problem) => `- ${problem.field}: ${problem.message}`),
      ].join("\n"),
    },
  ];
}
