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
    exampleCandidates: arrayOf(str, 16),
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

const QUERY_SLOTS = [
  "второе предложение второго абзаца sectionsBefore[0]",
  "второе предложение второго абзаца sectionsBefore[1]",
  "одно предложение paragraphsBefore таблицы",
  "одно предложение текста первого шага",
  "одно предложение текста второго шага",
  "одно предложение текста третьего шага",
  "одно предложение specialist.intro",
];

function queryPhrase(phrase) {
  if (typeof phrase === "string") return phrase.trim();
  return String(phrase?.text ?? phrase?.query ?? "").trim();
}

/** When sectionsBefore[0] is the example list, no additional query is placed there: install replaces those paragraphs. */
function querySlotsFor(article) {
  if (!article.examplePhrases) return QUERY_SLOTS;
  return [
    "второе предложение второго абзаца sectionsBefore[1] (раздел-проза, не список примеров)",
    "одно предложение paragraphsBefore таблицы",
    "одно предложение текста первого шага",
    "одно предложение текста второго шага",
    "одно предложение текста третьего шага",
    "одно предложение specialist.intro",
  ];
}

function querySlotLines(article) {
  const forms = article.additionalQueryForms ?? {};
  const slots = querySlotsFor(article);
  return (article.additionalQueries ?? []).map((phrase, index) => {
    const text = queryPhrase(phrase);
    if (!text) return "";
    const where = slots[index] ?? `отдельное предложение основной части вне раздела примеров (слот ${index + 1})`;
    const allowed = forms[text] ?? forms[phrase] ?? [];
    const variant = allowed.length ? ` Допустима только форма из брифа: ${allowed.map((form) => `«${form}»`).join(", ")}.` : " Другой падеж и пересказ не подходят.";
    return `- «${text}» – ${where}. Дословно, отдельным вхождением, не внутри слова и не текстом анкора.${variant}`;
  }).filter(Boolean).join("\n");
}

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
    "ОБЯЗАТЕЛЬНЫЕ ССЫЛКИ (каждую один раз, до того как пишешь абзацы):",
    bullets(titles(article.links?.contextual ?? [])),
    `Обязательны все ${(article.links?.contextual ?? []).length} ссылок из этого списка, точным slug, каждая один раз до FAQ. Норма брифа и гейта одна: ${L.contextualLinks[0]}–${L.contextualLinks[1]}, и этот список уже внутри неё. Урок про диапазон ${L.contextualLinks[0]}–${L.contextualLinks[1]} не отменяет список: пропуск любого slug – ошибка, лишняя ссылка /s – тоже. Место – разные разделы основной части: sectionsBefore, проза tableSection или текст шага. Одна ссылка – одно обычное предложение. Анкор – естественная фраза о содержании статьи, не «материал», не «здесь», не «подробнее», не «тут». Анкор из брифа ведёт только на свой slug, не на соседнюю статью. Если пару пропустишь, сборка вставит одно предложение «Смежная тема на сайте – [анкор](/s/slug).» Чужой slug и внешний адрес не добавляй.`,
    article.links?.anchors?.length ? `Пары анкор → адрес (не менять местами):\n${bullets(article.links.anchors.map((item) => `«${item.anchor}» → ${item.href}`))}` : "",
    "Куда нельзя: story, transition, storyEnding, цитата, молитва, invitation, question, practiceIntro, checklist, psychologyIntro, experts, specialist, faq. История и молитва остаются без ссылок.",
    "Как нельзя: не клеить «Подробнее:», «Читайте также:», «См. также:», «Узнайте больше:» и не ставить анкор-указатель. В анкоре нет квадратных скобок. Блок «Читайте также» в конце вставит сайт.",
    "",
    "СТРУКТУРА (поля JSON):",
    `- seoTitle: ≤ ${L.seoTitleMax} символов, начинается с «${article.query}» (с заглавной), отличается от H1, без названия сайта.`,
    `- description: РОВНО ${L.description[0]}–${L.description[1]} символов. Посчитай символы перед ответом: 116–135 не проходит. Содержит «${article.query}».`,
    `- faqHeading: «Частые вопросы о …» / «Частые вопросы об …», уникальный.`,
    `- story: 3–6 абзацев, начинается с пика – с прямой речи «…»; прямая речь в первых трёх абзацах. ${article.storyHeroine ? `Героиня «${article.storyHeroine}» – третье лицо от первой фразы до концовки: «сказала ${article.storyHeroine}», не «сказала я», не «подумала я». «Я» рассказчицы – только в transition.` : "Одна точка зрения, третье лицо: «сказала она», не «сказала я». Не смешивай «сказала я» с героиней, названной по имени. «Я» рассказчицы – только в transition."} Без оговорок «история вымышлена» и без ссылок /s/. Сюжет рассказывается только здесь, один раз. Это единственное место сюжета: в sectionsBefore, таблице, steps, specialist, faq и checklist нет имени героини и нет предметов сцены. Гейт story-retell проверяет каждый H2 основной части, кроме заголовков на «Три шага» и «Когда стоит обратиться»: там нельзя называть героиню и нельзя повторять предметы и действия сцены. Раздел с «примеры» в заголовке – только список фраз, без пересказа. Шаги и storyEnding не повторяют концовку.`,
    `- transition: последний абзац истории – мостик к теме, содержит запрос «${article.query}» дословно, в той форме, как в брифе (не жирным, не в кавычках). Запрос не склоняется. Не ставь перед ним «про», «о» или «об»: «разговор про ${article.query}» – ошибка. Вставь цепочку после двоеточия, тире или запятой: «так начинается тема – ${article.query}».`,
    `  story + transition вместе: ${L.story[0]}–${L.story[1]} слов.`,
    "- invitation: 1–2 предложения – приглашение выбрать одного из четырёх ангелов (слово «ангел» обязательно).",
    `- question: короткий вопрос-приглашение со знаком «?», без запроса «${article.query}» (будет жирным).`,
    `- practiceIntro: 1–2 абзаца по ≤ ${L.practiceIntroWords} слов. Единственное название практики – дословно «${article.practice.title}» (${article.practice.author}, ${article.practice.duration}).${article.practice.subtitle ? ` Подзаголовок «${article.practice.subtitle}» названием не является.` : " Не подставляй подзаголовок страницы вместо названия."} Свойства практики – ТОЛЬКО из материалов ниже, ничего не придумывай. Только позитивно.`,
    `- checklist: title без слова «шаг» (например «Пять действий, чтобы …» или «5 пунктов, чтобы …»). Список шагов в статье один – это поле steps. feedbackEmpty/Start/Half/Done – короткие ободряющие фразы; items – ровно 5 действий по 2–${L.checklistWords} слов, глаголом в повелительном наклонении. Число в заголовке равно числу пунктов: пять пунктов – только «Пять действий» или «5 пунктов», не «Три действия», не «Три шага» и не «Пять шагов». Если в тексте сказано «N шагов», пунктов сразу под этой фразой ровно N: обычный абзац между пунктами обрывает счёт. Во вступлении раздела «Три шага» число не пиши – его уже держит заголовок, а между ### стоят абзацы. Два слова повелительного наклонения проходят грамматику, одно слово и заглушка – нет. Не пиши общие пункты, которые уже есть на сайте: «Найдите тихое место.», «Наденьте наушники.», «Сядьте удобно и ровно.», «Сделайте несколько спокойных вдохов.». В каждом пункте есть деталь этой статьи (факт брифа, не дословный запрос). Если пункт всё же совпадёт с чужим, сборка допишет «перед записью» и название практики. Запрос в чек-лист не ставь: гейт считает его по всему тексту, лишнее вхождение ломает диапазон 2–4.`,
    `- psychologyIntro: один абзац перед карточками экспертов (раздел «${article.query}: что говорит психология» – заголовок вставит сайт).`,
    "- experts: ровно 2, в порядке брифа: name (как в брифе), thesis – короткий тезис карточки (3–7 слов, со строчной), bridge – 2–3 предложения: что эксперт говорит в цитате (с учётом контекста) и чем это полезно читателю. Не приписывай эксперту того, чего он не говорит (см. «не говорит»). Цитату не пересказывай в кавычках – её вставит сайт.",
        `- sectionsBefore: ровно ${plan.sectionsBefore.count} раздела {title, paragraphs}. Раздел без слова «примеры»: ${plan.sectionsBefore.wordsEach[0]}–${plan.sectionsBefore.wordsEach[1]} слов, три абзаца примерно по 130–150 слов, в каждом абзаце 3–5 предложений и не больше 7. Короткий раздел дописывай новым абзацем, а не десятком предложений в один. Раздел примеров – это список, не второй такой же рассказ. Не добавляй третий раздел.`,
    `- tableSection: раздел со сравнительной таблицей: title, paragraphsBefore + paragraphsAfter вместе ${plan.tableProse[0]}–${plan.tableProse[1]} слов, columns (3–4), rows (3–5 строк, по одному короткому значению на колонку).`,
    `- steps: title начинается с «Три шага, чтобы …» и обещает ровно три пункта, не «Пять шагов»; intro ${plan.stepsIntro[0]}–${plan.stepsIntro[1]} слов и без числа «три шага» (иначе гейт видит обещание и один соседний пункт); items – ровно 3 {title – повелительный глагол, без цифр и без «Если»; text ${plan.stepText[0]}–${plan.stepText[1]} слов}.`,
    "- sectionsAfter: пустой массив []. Лишний раздел даёт седьмой H2, гейт его отклоняет.",
    `- specialist: intro ${plan.specialistIntro[0]}–${plan.specialistIntro[1]} слов о том, когда нужна помощь специалиста (заголовок, телефоны и дисклеймер вставит сайт); items – 3–5 признаков, каждый со строчной буквы и с «;» в конце (последний – с «.»).`,
    `- faq: ровно ${L.faqCount} вопросов; каждый ответ 45–70 слов (гейт ${L.faqAnswer[0]}–${L.faqAnswer[1]}, 39 слов не проходит – посчитай). Один вопрос – про то, когда обратиться к психологу/специалисту, своей формулировкой, не дословной копией другой статьи. На вопрос с «ли» ответ может начаться с «Да» или «Нет», но только если это позиция брифа. На открытый вопрос («Как», «Почему», «Что», «Когда», «Зачем», «Чем») не начинай ответ с «Да», «Нет», «Можно» или «Нельзя». Ответ не противоречит основной части: не отрицай то, что статья уже разрешила. Вопросы и заголовки не повторяют уже опубликованные на сайте и другие статьи пакета. Слово «гарантирует» запрещено и в вопросе, и в ответе, даже после «не»: гейт ищет эту подстроку. Вопрос о доходе задай без него.`,
    article.faqHints?.length ? `ПОЗИЦИЯ ОТВЕТОВ FAQ (первое слово не противоречит позиции):\n${bullets(article.faqHints.map((hint) => `если вопрос содержит «${hint.match}», ответ держит позицию «${hint.stance}»`))}` : "",
    "- storyEnding: 2–3 предложения – коротко чем закончилась история (вставится после «**Чем закончилась история.**»). Не копируй абзацы story, не повторяй последнюю сцену и не пересказывай сюжет заново.",
    "- finalInvite: 1 предложение – мягкое приглашение вернуться к образу ангела; finalQuestion: короткий вопрос со «?».",
    "",
    "ОБЪЁМ:",
    `- ЦЕЛЬ основной части (от первого H2 после карточек экспертов до FAQ): ${plan.target[0]}–${plan.target[1]} слов, ориентир середины ≈ ${Math.round(budget.mid)}. Гейт пропускает ${L.mainBody[0]}–${L.mainBody[1]}, но черновик короче ${plan.target[0]} не готов. Черновик на 500–800 слов не проходит: пиши к середине цели, около 1200 слов, не к нижней границе гейта. Один абзац длиннее 7 предложений – наполнитель, так объём не набирают.`,
    "- Счёт слов основной части, его нужно набрать до отправки:",
    `  раздел без примеров: ${plan.sectionsBefore.wordsEach[0]}–${plan.sectionsBefore.wordsEach[1]}`,
    `  список примеров: ${plan.exampleList[0]}–${plan.exampleList[1]}`,
    `  проза таблицы: ${plan.tableProse[0]}–${plan.tableProse[1]}`,
    `  вступление шагов: ${plan.stepsIntro[0]}–${plan.stepsIntro[1]}; каждый из трёх шагов: ${plan.stepText[0]}–${plan.stepText[1]}`,
    `  вступление специалиста: ${plan.specialistIntro[0]}–${plan.specialistIntro[1]}`,
    `  заголовки, ячейки таблицы, пункты специалиста, телефоны и дисклеймер: около ${plan.chromeWords} слов`,
    `  сумма минимумов ≈ ${budget.low} и уже лежит в ${plan.target[0]}–${plan.target[1]}. Раздел короче своего минимума допиши до минимума.`,
    `- H2 в этой части: ${plan.h2} (ровно ${plan.sectionsBefore.count} раздела + таблица + «Три шага» + «Когда стоит обратиться к специалисту»). Гейт допускает ${L.bodyH2[0]}–${L.bodyH2[1]}. Семь и больше – ошибка.`,
    "ОБЯЗАТЕЛЬНЫЙ ПЛАН H2 (не заменяй пункт другим разделом):",
    article.examplePhrases
      ? `- sectionsBefore[0].title начинается с «Примеры» и содержит запрос статьи, это не одно слово «Примеры». Внутри маркированный список из ${article.examplePhrases.min}–${article.examplePhrases.max} фраз. Этот H2 нельзя заменить разделом вроде «План дня». Каждая фраза – настоящее время, без «не» и без страха, не короче 3 слов. Дополнительный запрос в этот раздел не пиши: sectionsBefore[0] – только список, слот запроса – sectionsBefore[1] или другой слот ниже.`
      : "- sectionsBefore[0] следует идее брифа. Отдельный список примеров гейт не требует.",
    `- ПЛАН ОДНОГО ВЫЗОВА, сумма около ${Math.round(budget.mid)}: один раздел-проза ${plan.sectionsBefore.wordsEach[0]}–${plan.sectionsBefore.wordsEach[1]} слов; список примеров ${plan.exampleList[0]}–${plan.exampleList[1]}; проза таблицы ${plan.tableProse[0]}–${plan.tableProse[1]}; вступление шагов ${plan.stepsIntro[0]}–${plan.stepsIntro[1]}; каждый шаг ${plan.stepText[0]}–${plan.stepText[1]}; specialist.intro ${plan.specialistIntro[0]}–${plan.specialistIntro[1]}. Вместе со служебными ~${plan.chromeWords} словами это около 1200 и должно попасть в ${L.mainBody[0]}–${L.mainBody[1]} до отправки, без второго черновика.`,
    `- Вся статья с FAQ: ${L.total[0]}–${L.total[1]} слов.`,
    `- Запрос «${article.query}» в тексте статьи всего ${L.mainQuery[0]}–${L.mainQuery[1]} раза (с учётом transition), не в жирном.`,
    "",
    "ССЫЛКИ: только список «ОБЯЗАТЕЛЬНЫЕ ССЫЛКИ» выше, все slug из него, формат [анкор](/s/slug). По одной в разных разделах основной части. Не в историю и не в цитату. Не «Подробнее: [материал](/s/…)» и не две склейки в один абзац. Не «можно использовать и [анкор] через …»: ссылка стоит внутри грамматичной фразы.",
    article.additionalQueries?.length ? `ДОПОЛНИТЕЛЬНЫЕ ЗАПРОСЫ: все ${article.additionalQueries.length}. Каждый вплетён в обычное предложение о содержании, дословно, с пробелом или знаком препинания по краям, не внутри другого слова, не текстом анкора и не только в FAQ. Не вставляй мета-обороты «запрос «…»», «как в теме «…»» и «Вопрос: «…»». Пересказ и другая форма слова не считаются.${Object.keys(article.additionalQueryForms ?? {}).length ? " Форма из брифа – единственное допустимое отклонение." : ""} Ноль пропусков – иначе черновик не готов:\n${querySlotLines(article)}` : "",
    article.examplePhrases
      ? `ПРИМЕРЫ ФРАЗ: поле exampleCandidates – ровно 12 отдельных строк, не абзац. Каждая – настоящее время, позитивная, не короче 3 слов, без «не», без имени героини. Сборка оставит от ${article.examplePhrases.min} до ${article.examplePhrases.max} годных и поставит их маркированным списком. Раздел: H2 со словом «примеры» и запросом, не голое «Примеры». В paragraphs этого раздела не пересказывай историю и не ставь дополнительный запрос: список вставит код. Если предложение с дополнительным запросом всё же окажется в абзаце этого раздела, сборка сохранит его рядом со списком. Если годных строк меньше ${article.examplePhrases.min}, черновик не готов. Не пиши «Ниже – простые примеры» и «Вот примеры», если сразу после нет списка. Не оставляй английские заметки (Wait, TODO, must not include).`
      : "ПРИМЕРЫ ФРАЗ: в брифе диапазон не задан, гейт список не считает. Поле exampleCandidates верни пустым массивом. Не добавляй отдельный H2 «примеры» только ради числа. Если примеры всё же есть, каждая фраза – настоящее время, позитивная, не короче 3 слов, без «не». Не оставляй английские заметки (Wait, TODO, must not include).",
    "",
    "СВЕРКА ПЕРЕД ОТПРАВКОЙ:",
    `- основная часть ${plan.target[0]}–${plan.target[1]} слов, около 1200 (черновик на 600–800 и на 911 не проходит) и около ${plan.h2} H2 (гейт ${L.bodyH2[0]}–${L.bodyH2[1]}); ни один абзац не длиннее 7 предложений;`,
    "- steps.title начинается с «Три шага», пунктов ровно 3; checklist – 5 пунктов без слова «шаг», и число в его title тоже 5;",
    "- открытый вопрос FAQ не начинается с «Да» или «Нет»; позиция из брифа не перевёрнута; ответ не спорит с основной частью;",
    "- нет английских заметок и длинного тире «—»: только среднее «–»;",
    "- ни один раздел не пересказывает story;",
    `- запрос «${article.query}» не стоит сразу после «про», «о» или «об»;`,
    `- практика названа дословно «${article.practice.title}»;`,
    article.additionalQueries?.length ? `- в основной части, не в анкоре, есть каждый из ${article.additionalQueries.length} дополнительных запросов – в своём слоте.` : "- дополнительных запросов в брифе нет.",
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
