// Prompt and strict JSON schema for sergey-zoya.ru articles. The model writes ONLY texts
// (fields); everything fixed – carousel, CTA, TOC, player, expert cards with quotes, phones,
// disclaimer, «Читайте также», final picture – is inserted by assemble.mjs.
import { SZ } from "./config.mjs";
import { CORRECTIONS, LESSONS, toneSample } from "./knowledge.mjs";

const str = { type: "string" };
// As in lib/prompt.mjs: only upper bounds go into the grammar (runaway guard).
const arrayOf = (items, maxItems) => ({ type: "array", items, maxItems });
function object(properties) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}
const textSection = () => object({ title: str, paragraphs: arrayOf(str, 5) });

export function szArticleSchema() {
  return object({
    seoTitle: str,
    description: str,
    faqHeading: str,
    story: arrayOf(str, 8),
    transition: str,
    invitation: str,
    question: str,
    practiceIntro: arrayOf(str, 2),
    checklist: object({
      title: str,
      feedbackEmpty: str,
      feedbackStart: str,
      feedbackHalf: str,
      feedbackDone: str,
      items: arrayOf(str, 5),
    }),
    psychologyIntro: str,
    experts: arrayOf(object({ name: str, thesis: str, bridge: str }), 2),
    sectionsBefore: arrayOf(textSection(), 3),
    tableSection: object({
      title: str,
      paragraphsBefore: arrayOf(str, 2),
      columns: arrayOf(str, 5),
      rows: arrayOf(arrayOf(str, 5), 6),
      paragraphsAfter: arrayOf(str, 2),
    }),
    steps: object({ title: str, intro: str, items: arrayOf(object({ title: str, text: str }), 3) }),
    sectionsAfter: arrayOf(textSection(), 2),
    specialist: object({ intro: str, items: arrayOf(str, 6) }),
    faq: arrayOf(object({ question: str, answer: str }), 5),
    storyEnding: str,
    finalInvite: str,
    finalQuestion: str,
  });
}

const SYSTEM = [
  "Ты – Зоя Петрова, автор сайта sergey-zoya.ru (Сергей и Зоя, авторские медитации и практики). Пишешь по-русски, тепло, ясно, на «вы», без эзотерического пафоса.",
  "Ты не психолог и не называешь себя психологом. Эзотерику описываешь как культурные и духовные традиции, а не как науку.",
  "Никаких обещаний исцеления, гарантий, защиты, оберегов, «призыва» и т. п. Практику описываешь только позитивно: что она даёт и как её пройти; не пиши про дискомфорт, неприятные ощущения и не советуй остановить запись.",
  "Только среднее тире «–» (U+2013), никогда «—». Ёлочки «» для кавычек. Порядковые числительные словами («девятая», а не «9-я»).",
  "Никаких внешних ссылок и адресов сайтов, никаких упоминаний MAX и мессенджеров – кнопки вставит сайт.",
  "Верни только JSON по схеме, без пояснений.",
  "",
  "УРОКИ РЕДАКТУРЫ ПРОШЛЫХ СТАТЕЙ (обязательно):",
  ...LESSONS.map((lesson) => `- ${lesson.replace(/ \[[^\]]+\]$/, "")}`),
  "",
  "ОШИБКИ ИЗ РЕВЬЮ ПРОШЛЫХ ПАКЕТОВ – «неверно → верно» (не повторяй их ни в какой теме):",
  ...CORRECTIONS.map((item) => `- ${item}`),
].join("\n");

let sample;
const toneJson = () => (sample ??= JSON.stringify(toneSample(), null, 1));

const bullets = (items) => items.filter(Boolean).map((item) => `- ${item}`).join("\n");

export function buildSzMessages(article, site, { avoid, siblings = new Map() } = {}) {
  const L = SZ.limits;
  const titles = (slugs) => slugs.map((slug) => `/s/${slug} – «${site.articles.get(slug)?.title ?? siblings.get(slug) ?? slug}»${siblings.has(slug) ? " (статья этого пакета)" : ""}`);
  const user = [
    `СТАТЬЯ: «${article.title}» (H1 уже задан). Основной запрос: «${article.query}».`,
    article.intent && `Намерение читателя: ${article.intent}`,
    article.audience && `Читатель: ${article.audience}`,
    "",
    "СТРУКТУРА (поля JSON):",
    `- seoTitle: ≤ ${L.seoTitleMax} символов, начинается с «${article.query}» (с заглавной), отличается от H1, без названия сайта.`,
    `- description: ${L.description[0]}–${L.description[1]} символов (считай!), содержит «${article.query}».`,
    `- faqHeading: «Частые вопросы о …» / «Частые вопросы об …», уникальный.`,
    `- story: 3–6 абзацев истории от первого лица (Зоя или героиня), начинается с пика – с прямой речи «…»; прямая речь в первых трёх абзацах. Без оговорок «история вымышлена».`,
    `- transition: последний абзац истории – мостик к теме, содержит запрос «${article.query}» как есть (не жирным).`,
    `  story + transition вместе: ${L.story[0]}–${L.story[1]} слов.`,
    "- invitation: 1–2 предложения – приглашение выбрать одного из четырёх ангелов (слово «ангел» обязательно).",
    `- question: короткий вопрос-приглашение со знаком «?», без запроса «${article.query}» (будет жирным).`,
    `- practiceIntro: 1–2 абзаца по ≤ ${L.practiceIntroWords} слов о практике «${article.practice.title}» (${article.practice.author}, ${article.practice.duration}). Свойства практики – ТОЛЬКО из материалов ниже, ничего не придумывай. Только позитивно.`,
    `- checklist: title (например «5 шагов, чтобы …»), feedbackEmpty/Start/Half/Done – короткие ободряющие фразы; items – ровно 5 действий по ≤ ${L.checklistWords} слов, глаголом в повелительном наклонении.`,
    `- psychologyIntro: один абзац перед карточками экспертов (раздел «${article.query}: что говорит психология» – заголовок вставит сайт).`,
    "- experts: ровно 2, в порядке брифа: name (как в брифе), thesis – короткий тезис карточки (3–7 слов, со строчной), bridge – 2–3 предложения: что эксперт говорит в цитате (с учётом контекста) и чем это полезно читателю. Не приписывай эксперту того, чего он не говорит (см. «не говорит»). Цитату не пересказывай в кавычках – её вставит сайт.",
    "- sectionsBefore: 1–2 раздела {title, paragraphs (2–4 абзаца по 60–110 слов)} – суть темы.",
    "- tableSection: раздел со сравнительной таблицей: title, paragraphsBefore (1 абзац), columns (3–4), rows (3–5 строк, по одному короткому значению на колонку), paragraphsAfter (0–1 абзац).",
    "- steps: title начинается с «Три шага, чтобы …»; intro – 1 абзац; items – ровно 3 {title – повелительный глагол, без цифр и без «Если»; text – 50–90 слов}.",
    "- sectionsAfter: 0–1 раздел {title, paragraphs}.",
    "- specialist: intro – 1 абзац о том, когда нужна помощь специалиста (заголовок, телефоны и дисклеймер вставит сайт); items – 3–5 признаков, каждый со строчной буквы и с «;» в конце (последний – с «.»).",
    `- faq: ровно ${L.faqCount} вопросов; ответы ${L.faqAnswer[0]}–${L.faqAnswer[1]} слов каждый (считай!); один вопрос – про то, когда обратиться к психологу/специалисту. Вопросы и заголовки не повторяют уже опубликованные на сайте.`,
    "- storyEnding: 2–3 предложения – чем закончилась история из начала (вставится после «**Чем закончилась история.**»).",
    "- finalInvite: 1 предложение – мягкое приглашение вернуться к образу ангела; finalQuestion: короткий вопрос со «?».",
    "",
    "ОБЪЁМ:",
    `- От первого H2 после карточек экспертов до FAQ (все sections, tableSection, steps, specialist): ${L.mainBody[0]}–${L.mainBody[1]} слов; всего H2 в этой части ${L.bodyH2[0]}–${L.bodyH2[1]} (включая «Три шага» и «Когда стоит обратиться к специалисту»).`,
    `- Вся статья с FAQ: ${L.total[0]}–${L.total[1]} слов.`,
    `- Запрос «${article.query}» в тексте статьи всего ${L.mainQuery[0]}–${L.mainQuery[1]} раза (с учётом transition), не в жирном.`,
    "",
    `ССЫЛКИ: в абзацы разделов (sectionsBefore/tableSection/steps/sectionsAfter) вставь ${L.contextualLinks[0]}–${L.contextualLinks[1]} ссылок в формате markdown [анкор](/s/slug) ТОЛЬКО на эти статьи:`,
    bullets(titles(article.links.contextual)),
    "Других ссылок нет. «См. в статье …» не пиши – ссылка встраивается в предложение.",
    "",
    "ПРАКТИКА – МАТЕРИАЛЫ (единственный источник свойств практики):",
    article.practice.materials,
    "",
    "ЭКСПЕРТЫ (цитаты вставит сайт дословно):",
    ...article.experts.map((expert, i) => [
      `${i + 1}. ${expert.name} – ${expert.role}.`,
      `   Цитата: «${expert.quote}»`,
      `   Источник: ${expert.source}.`,
      `   Контекст: ${expert.context}`,
      `   Эксперт НЕ говорит: ${expert.doesNotSay}`,
      expert.caution && `   Осторожно (из EXPERTS_RU.md): ${expert.caution}`,
    ].filter(Boolean).join("\n")),
    "",
    article.facts.length && `ФАКТЫ (можно опираться только на них и на общеизвестное):\n${bullets(article.facts)}`,
    article.commonMistakes.length && `ЧАСТЫЕ ОШИБКИ ЧИТАТЕЛЕЙ:\n${bullets(article.commonMistakes)}`,
    article.storyHint && `ИСТОРИЯ (идея): ${article.storyHint}`,
    article.sectionsHint.length && `РАЗДЕЛЫ (идеи):\n${bullets(article.sectionsHint)}`,
    article.tableHint && `ТАБЛИЦА (идея): ${article.tableHint}`,
    article.forbiddenPhrases.length && `НЕ ИСПОЛЬЗУЙ:\n${bullets(article.forbiddenPhrases)}`,
    article.extraInstructions.length && `ДОПОЛНИТЕЛЬНО:\n${bullets(article.extraInstructions)}`,
    "",
    "ОБРАЗЕЦ ТОНА (фрагменты опубликованной статьи «Практическая эзотерика»; бери интонацию и ритм, не копируй текст и темы):",
    toneJson(),
    avoid?.length ? `НЕ ПОВТОРЯЙ заголовки/вопросы/пункты чек-листа (уже есть на сайте или в других статьях пакета):\n${bullets(avoid.slice(0, 80))}` : "",
  ].filter((line) => line !== false && line !== null && line !== undefined && line !== 0).join("\n");
  return [{ role: "system", content: SYSTEM }, { role: "user", content: user }];
}

export function buildSzRepairMessages(messages, previous, problems, stats = {}) {
  const errors = problems.filter((problem) => problem.severity === "error");
  const hints = [];
  if (stats.storyWords !== undefined) hints.push(`Сейчас: история ${stats.storyWords} слов, основная часть ${stats.mainWords}, всего ${stats.totalWords}.`);
  hints.push("Сохрани ссылки [анкор](/s/slug) и всё, что не указано в ошибках.");
  return [
    ...messages,
    { role: "assistant", content: JSON.stringify(previous) },
    {
      role: "user",
      content: [
        "Автоматическая проверка сайта нашла ошибки. Исправь только их, остальной текст сохрани.",
        "Верни полный исправленный JSON того же формата, без пояснений.",
        "",
        "ОШИБКИ (поле → ошибка):",
        ...errors.map((problem) => `- ${problem.field}: ${problem.message}`),
        "",
        ...hints,
      ].join("\n"),
    },
  ];
}
