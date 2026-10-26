// Prompt and strict JSON schema for sergey-zoya.ru articles. The model writes ONLY texts
// (fields); everything fixed – carousel, CTA, TOC, player, expert cards with quotes, phones,
// disclaimer, «Читайте также», final picture – is inserted by assemble.mjs.
import { normalizeSzFields } from "./assemble.mjs";
import { SZ, SZ_BODY_PLAN, szBodyPlanBudget } from "./config.mjs";
import { CORRECTIONS, LESSONS, toneSample } from "./knowledge.mjs";
import { fieldProseDefect } from "./rules.mjs";

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
  const plan = SZ_BODY_PLAN;
  const budget = szBodyPlanBudget(plan);
  const titles = (slugs) => slugs.map((slug) => `/s/${slug} – «${site.articles.get(slug)?.title ?? siblings.get(slug) ?? slug}»${siblings.has(slug) ? " (статья этого пакета)" : ""}`);
  const user = [
    `СТАТЬЯ: «${article.title}» (H1 уже задан). Основной запрос: «${article.query}».`,
    article.intent && `Намерение читателя: ${article.intent}`,
    article.audience && `Читатель: ${article.audience}`,
    "",
    "СТРУКТУРА (поля JSON):",
    `- seoTitle: ≤ ${L.seoTitleMax} символов, начинается с «${article.query}» (с заглавной), отличается от H1, без названия сайта.`,
    `- description: РОВНО ${L.description[0]}–${L.description[1]} символов. Посчитай символы перед ответом: 116–135 не проходит. Содержит «${article.query}».`,
    `- faqHeading: «Частые вопросы о …» / «Частые вопросы об …», уникальный.`,
    `- story: 3–6 абзацев истории от первого лица (Зоя или героиня), начинается с пика – с прямой речи «…»; прямая речь в первых трёх абзацах. Без оговорок «история вымышлена». Сюжет рассказывается только здесь: разделы, таблица и шаги не пересказывают ту же сцену и не повторяют ход с теми же именами.`,
    `- transition: последний абзац истории – мостик к теме, содержит запрос «${article.query}» как есть (не жирным).`,
    `  story + transition вместе: ${L.story[0]}–${L.story[1]} слов.`,
    "- invitation: 1–2 предложения – приглашение выбрать одного из четырёх ангелов (слово «ангел» обязательно).",
    `- question: короткий вопрос-приглашение со знаком «?», без запроса «${article.query}» (будет жирным).`,
    `- practiceIntro: 1–2 абзаца по ≤ ${L.practiceIntroWords} слов о практике «${article.practice.title}» (${article.practice.author}, ${article.practice.duration}). Свойства практики – ТОЛЬКО из материалов ниже, ничего не придумывай. Только позитивно.`,
    `- checklist: title (например «5 шагов, чтобы …»), feedbackEmpty/Start/Half/Done – короткие ободряющие фразы; items – ровно 5 действий по 2–${L.checklistWords} слов, глаголом в повелительном наклонении. Число в title совпадает с пятью пунктами («5 шагов» или «Пять шагов», не «Три шага»). Короткая команда («Наденьте наушники.») подходит; одно слово и заглушка – нет.`,
    `- psychologyIntro: один абзац перед карточками экспертов (раздел «${article.query}: что говорит психология» – заголовок вставит сайт).`,
    "- experts: ровно 2, в порядке брифа: name (как в брифе), thesis – короткий тезис карточки (3–7 слов, со строчной), bridge – 2–3 предложения: что эксперт говорит в цитате (с учётом контекста) и чем это полезно читателю. Не приписывай эксперту того, чего он не говорит (см. «не говорит»). Цитату не пересказывай в кавычках – её вставит сайт.",
    `- sectionsBefore: ровно ${plan.sectionsBefore.count} раздела {title, paragraphs}. Каждый раздел ${plan.sectionsBefore.wordsEach[0]}–${plan.sectionsBefore.wordsEach[1]} слов: три абзаца примерно по 75–85 слов. Два коротких абзаца до этого минимума не дотягивают. Не добавляй третий раздел.`,
    `- tableSection: раздел со сравнительной таблицей: title, paragraphsBefore + paragraphsAfter вместе ${plan.tableProse[0]}–${plan.tableProse[1]} слов, columns (3–4), rows (3–5 строк, по одному короткому значению на колонку).`,
    `- steps: title начинается с «Три шага, чтобы …» и обещает ровно три пункта, не «Пять шагов»; intro ${plan.stepsIntro[0]}–${plan.stepsIntro[1]} слов; items – ровно 3 {title – повелительный глагол, без цифр и без «Если»; text ${plan.stepText[0]}–${plan.stepText[1]} слов}.`,
    "- sectionsAfter: пустой массив []. Лишний раздел даёт седьмой H2, гейт его отклоняет.",
    `- specialist: intro ${plan.specialistIntro[0]}–${plan.specialistIntro[1]} слов о том, когда нужна помощь специалиста (заголовок, телефоны и дисклеймер вставит сайт); items – 3–5 признаков, каждый со строчной буквы и с «;» в конце (последний – с «.»).`,
    `- faq: ровно ${L.faqCount} вопросов; каждый ответ 45–70 слов (гейт ${L.faqAnswer[0]}–${L.faqAnswer[1]}, 39 слов не проходит – посчитай). Один вопрос – про то, когда обратиться к психологу/специалисту. На вопрос с «ли» ответ может начаться с «Да» или «Нет». На открытый вопрос («Как», «Почему», «Что», «Когда», «Зачем», «Чем») не начинай ответ с «Да», «Нет», «Можно» или «Нельзя». Вопросы и заголовки не повторяют уже опубликованные на сайте и другие статьи пакета.`,
    "- storyEnding: 2–3 предложения – коротко чем закончилась история (вставится после «**Чем закончилась история.**»). Не копируй абзацы story и не пересказывай сюжет заново.",
    "- finalInvite: 1 предложение – мягкое приглашение вернуться к образу ангела; finalQuestion: короткий вопрос со «?».",
    "",
    "ОБЪЁМ:",
    `- ЦЕЛЬ основной части (от первого H2 после карточек экспертов до FAQ): ${plan.target[0]}–${plan.target[1]} слов, ориентир середины ≈ ${Math.round(budget.mid)}. Гейт пропускает ${L.mainBody[0]}–${L.mainBody[1]}. Черновик на 500–800 слов не проходит: пиши к середине цели, не к нижней границе гейта.`,
    "- Счёт слов основной части, его нужно набрать до отправки:",
    `  разделы sectionsBefore: ${plan.sectionsBefore.count} × ${plan.sectionsBefore.wordsEach[0]}–${plan.sectionsBefore.wordsEach[1]}`,
    `  проза таблицы: ${plan.tableProse[0]}–${plan.tableProse[1]}`,
    `  вступление шагов: ${plan.stepsIntro[0]}–${plan.stepsIntro[1]}; каждый из трёх шагов: ${plan.stepText[0]}–${plan.stepText[1]}`,
    `  вступление специалиста: ${plan.specialistIntro[0]}–${plan.specialistIntro[1]}`,
    `  заголовки, ячейки таблицы, пункты специалиста, телефоны и дисклеймер: около ${plan.chromeWords} слов`,
    `  сумма минимумов ≈ ${budget.low} и уже лежит в ${plan.target[0]}–${plan.target[1]}. Раздел короче своего минимума допиши до минимума.`,
    `- H2 в этой части: ${plan.h2} (ровно ${plan.sectionsBefore.count} раздела + таблица + «Три шага» + «Когда стоит обратиться к специалисту»). Гейт допускает ${L.bodyH2[0]}–${L.bodyH2[1]}. Семь и больше – ошибка.`,
    `- Вся статья с FAQ: ${L.total[0]}–${L.total[1]} слов.`,
    `- Запрос «${article.query}» в тексте статьи всего ${L.mainQuery[0]}–${L.mainQuery[1]} раза (с учётом transition), не в жирном.`,
    "",
    `ССЫЛКИ: в абзацы разделов (sectionsBefore/tableSection/steps/sectionsAfter) вставь ${L.contextualLinks[0]}–${L.contextualLinks[1]} ссылок в формате markdown [анкор](/s/slug) ТОЛЬКО на эти статьи:`,
    bullets(titles(article.links.contextual)),
    "Каждая ссылка – внутри своего предложения и в другом разделе. Анкор называет тему статьи своими словами: не «материал», не «здесь», не «подробнее», не «тут». Не приклеивай в конец абзаца «Подробнее: [материал](/s/…)» и не ставь две такие склейки в один абзац. «См. в статье …» не пиши.",
    article.additionalQueries?.length ? `ДОПОЛНИТЕЛЬНЫЕ ЗАПРОСЫ: каждый хотя бы один раз, дословно, без кавычек, в разных предложениях основной части (не только в FAQ):\n${bullets(article.additionalQueries)}` : "",
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

/** Select whole top-level fields; an ambiguous gate error conservatively keeps all candidates. */
export function szRepairFields(previous, problems) {
  const keys = Object.keys(szArticleSchema().properties);
  const sections = ["sectionsBefore", "tableSection", "steps", "sectionsAfter", "specialist"];
  const aliases = { sections, table: ["tableSection"], headings: [...sections, "faqHeading"], questions: ["faq"], quotations: ["experts"] };
  const selected = new Set();
  for (const problem of problems.filter((item) => item.severity === "error")) {
    const field = String(problem.field).split(/[.[]/)[0];
    let matches = keys.includes(field) ? [field] : aliases[field];
    // unique files every heading under "sections", so a duplicated faqHeading is not in that alias.
    // bold-query is filed under "question" even when the bold text lives in finalQuestion or a section.
    if (/^unique(?:-pack)?$|^bold-query$/.test(problem.code)) {
      const quoted = [...String(problem.message).matchAll(/«([^»]+)»/g)].map((match) => match[1]);
      const texts = problem.code === "bold-query" ? quoted.slice(-1) : quoted;
      const actual = texts.some(Boolean) ? keys.filter((key) => texts.some((text) => text && JSON.stringify(previous[key] ?? null).includes(text))) : [];
      if (actual.length) matches = actual;
      else if (problem.code === "bold-query") matches = ["question", "finalQuestion"];
      else if ((field === "sections" || field === "headings") && /заголовок/u.test(problem.message)) matches = [...sections, "faqHeading"];
    }
    if (!matches) {
      const quoted = [...problem.message.matchAll(/«([^»]+)»/g)].map((match) => match[1]);
      matches = keys.filter((key) => quoted.some((text) => JSON.stringify(previous[key])?.includes(text)));
      if (!matches.length && /expert|portrait/.test(problem.code)) matches = ["experts"];
      if (!matches.length && /checklist/.test(problem.code)) matches = ["checklist"];
      if (!matches.length && /specialist|disclaimer/.test(problem.code)) matches = ["specialist"];
      if (!matches.length) matches = keys;
    }
    for (const key of matches) selected.add(key);
  }
  return keys.filter((key) => selected.has(key));
}

export function buildSzTargetedRepair(article, previous, problems) {
  const fields = szRepairFields(previous, problems);
  const schema = object(Object.fromEntries(fields.map((key) => [key, szArticleSchema().properties[key]])));
  const relevant = { title: article.title, query: article.query, facts: article.facts, forbiddenPhrases: article.forbiddenPhrases, extraInstructions: article.extraInstructions };
  if (fields.includes("practiceIntro") || fields.includes("checklist")) relevant.practice = article.practice;
  if (fields.includes("experts") || problems.some((p) => /expert|quote|verbatim/.test(p.code))) {
    relevant.experts = article.experts.map(({ name, quote, source, sourceText, context, doesNotSay, caution, forbiddenInBridge }) => ({ name, quote, source, sourceText, context, doesNotSay, caution, forbiddenInBridge }));
    relevant.verbatim = article.verbatim;
  }
  if (fields.some((key) => ["story", "transition", "storyEnding"].includes(key))) {
    relevant.storyHint = article.storyHint;
    relevant.storyContext = Object.fromEntries(["story", "transition", "storyEnding"].map((key) => [key, previous[key]]));
    relevant.storyContextRule = "storyContext – контекст только для чтения, не включай его в ответ. Меняй только выбранные поля; сохрани героев, факты и детали, согласуй начало, переход и окончание истории.";
  }
  if (fields.some((key) => ["sectionsBefore", "tableSection", "steps", "sectionsAfter"].includes(key))) relevant.links = article.links.contextual;
  const messages = [
    { role: "system", content: "Ты – Зоя Петрова. Пиши тепло, ясно, по-русски, на «вы», без пафоса. Зоя не психолог; эзотерика не наука. Только тире «–» и кавычки «». Цитаты строго дословно по материалам, не приписывай экспертам выводов. Без обещаний лечения, гарантий, защиты, призыва, предсказаний, дискомфорта и советов остановить запись. Без внешних адресов, MAX, видимых дат и служебных пометок. Не выдумывай факты. Сохрани внутренние ссылки. Исправь ошибки с указанными длинами полей. Верни только JSON patch по схеме: полные значения выбранных полей, без остальных полей и пояснений." },
    { role: "user", content: ["БРИФ:", JSON.stringify(relevant), "ОШИБКИ (включая требуемые длины):", ...problems.filter((p) => p.severity === "error").map((p) => `${p.field}: ${p.message}`), "ТЕКУЩИЕ ПОЛЯ:", JSON.stringify(Object.fromEntries(fields.map((key) => [key, previous[key]])))].join("\n") },
  ];
  return { fields, schema, messages };
}

// Validate the exact schema subset used above, including nested required fields and array bounds.
function matchesSchema(value, schema) {
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "array") return Array.isArray(value) && value.length <= schema.maxItems && value.every((item) => matchesSchema(item, schema.items));
  if (schema.type !== "object" || !value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => Object.hasOwn(schema.properties, key))
    && schema.required.every((key) => Object.hasOwn(value, key) && matchesSchema(value[key], schema.properties[key]));
}

// Judge the patch only after sz normalization: «****» and «Чем закончилась история.» become empty,
// and a one-letter thesis is not substantive. Applies to every string in the patch, not one field.
function rejectHollow(normalized, patch, path) {
  if (typeof patch === "string") return fieldProseDefect(typeof normalized === "string" ? normalized : "", path);
  if (Array.isArray(patch)) {
    if (!Array.isArray(normalized) || (patch.length && normalized.length < patch.length)) return `${path}: после нормализации непустые элементы исчезли`;
    for (let i = 0; i < patch.length; i += 1) {
      const reason = rejectHollow(normalized[i], patch[i], `${path}[${i}]`);
      if (reason) return reason;
    }
    return null;
  }
  if (patch && typeof patch === "object") {
    for (const [key, value] of Object.entries(patch)) {
      const reason = rejectHollow(normalized?.[key], value, path ? `${path}.${key}` : key);
      if (reason) return reason;
    }
  }
  return null;
}

function project(source, shape) {
  if (Array.isArray(shape)) return Array.isArray(source) ? source : [];
  if (shape && typeof shape === "object") return Object.fromEntries(Object.keys(shape).map((key) => [key, project(source?.[key], shape[key])]));
  return source;
}

// Structural validity alone accepts experts: [] and a thesis of «а» / «главная мысль а». Reject before merge.
export function szRepairPatchRejection(previous, patch, schema, brief) {
  if (!schema?.required?.length || !matchesSchema(patch, schema)) return "невалидный/пустой patch: нарушение схемы";
  if (Object.hasOwn(patch, "experts")) {
    const expected = brief?.experts;
    if (!expected?.length || patch.experts.length !== expected.length) return "experts: требуется полный список экспертов из брифа";
    const names = patch.experts.map((expert) => expert.name);
    if (new Set(names).size !== names.length || names.some((name, i) => name !== expected[i].name)) return "experts: имена/порядок не совпадают с брифом или есть дубли";
  }
  const merged = { ...structuredClone(previous ?? {}), ...structuredClone(patch) };
  const normalized = normalizeSzFields(merged).fields;
  const hollow = rejectHollow(normalized, patch, "");
  if (hollow) return hollow;
  const before = normalizeSzFields(previous ?? {}).fields;
  const lostContent = (before, after, path) => {
    if (typeof after === "string") return typeof before === "string" && before.trim() && !after.trim() ? `${path}: непустая строка стала пустой` : null;
    if (Array.isArray(after)) {
      if (Array.isArray(before) && before.length && !after.length) return `${path}: непустой массив стал пустым`;
      for (let i = 0; i < after.length; i += 1) {
        const reason = lostContent(before?.[i], after[i], `${path}[${i}]`);
        if (reason) return reason;
      }
      return null;
    }
    if (after && typeof after === "object") {
      for (const [key, value] of Object.entries(after)) {
        const reason = lostContent(before?.[key], value, path ? `${path}.${key}` : key);
        if (reason) return reason;
      }
    }
    return null;
  };
  return lostContent(project(before, patch), project(normalized, patch), "");
}

export function applySzRepairPatch(previous, patch, schema, brief) {
  if (szRepairPatchRejection(previous, patch, schema, brief)) return null;
  return { ...structuredClone(previous), ...structuredClone(patch) };
}
