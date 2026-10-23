// Expert pool for sergey-zoya.ru. The list of allowed experts, their Ж/М and РУ/ЗАР tags and
// cautions come from EXPERTS_RU.md (Sergey-approved pool; the whole file is read, including
// sections added later, e.g. «Расширение пула»). A copy ships in knowledge/EXPERTS_RU.md;
// `--experts <path>` or WRITER_SZ_EXPERTS points the writer at a fresher file.
// Card data (portrait, alt, credit, role) is taken from cards already published on the site,
// then from KNOWN_CARDS below, then from the brief (`card`). No portrait – no card.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BUNDLED_EXPERTS_PATH = join(dirname(fileURLToPath(import.meta.url)), "knowledge/EXPERTS_RU.md");

const E = (name, gender, group, photo, alt, credit, role) => ({ name, gender, group, photo, alt, credit, role });

export const KNOWN_CARDS = [
  E("Юлия Гиппенрейтер", "Ж", "РУ", "gippenreiter.webp", "Портрет Юлии Гиппенрейтер", "Фото: Svklimkin, CC BY-SA 4.0", "Психолог, профессор МГУ, автор книги «Общаться с ребёнком. Как?»"),
  E("Марина Мелия", "Ж", "РУ", "melia.webp", "Портрет Марины Мелия", "Фото: Дмитрий Лившиц, CC BY-SA 4.0", "Психолог, кандидат психологических наук, автор книги «Хочу – Могу – Надо»"),
  E("Ольга Маховская", "Ж", "РУ", "makhovskaya.webp", "Портрет Ольги Маховской", "Фото: Rodrigo Fernández, CC BY-SA 4.0", "Психолог, кандидат психологических наук, автор книг о женской психологии"),
  E("Галина Солдатова", "Ж", "РУ", null, "Портрет Галины Солдатовой", "Фото: Svklimkin, CC BY-SA 4.0", "Психолог, доктор психологических наук, профессор МГУ"),
  E("Мария Фаликман", "Ж", "РУ", "falikman.webp", "Портрет Марии Фаликман", "Фото: Александр Кремлёв, CC BY 4.0", "Когнитивный психолог, доктор психологических наук, исследовательница внимания"),
  E("Михаил Лабковский", "М", "РУ", "labkovsky.webp", "Портрет Михаила Лабковского", "Фото: Aleksandr Plyushchev, CC BY 2.0", "Психолог, автор книги «Хочу и буду»"),
  E("Дмитрий Леонтьев", "М", "РУ", "leontiev.webp", "Портрет Дмитрия Леонтьева", "Фото: cheloVechek, CC BY-SA 4.0", "Психолог, доктор психологических наук, профессор МГУ и НИУ ВШЭ"),
  E("Александр Асмолов", "М", "РУ", null, "Портрет Александра Асмолова", "Фото: Svklimkin, CC BY-SA 4.0", "Психолог, академик РАО, доктор психологических наук"),
  E("Сергей Ениколопов", "М", "РУ", "enikolopov.webp", "Портрет Сергея Ениколопова", "Фото: Svklimkin, CC BY-SA 4.0", "Клинический психолог, кандидат психологических наук, исследователь агрессии"),
  E("Александр Тхостов", "М", "РУ", null, "Портрет Александра Тхостова", "Фото: Плужников Илья, CC BY-SA 4.0", "Психолог, доктор психологических наук, профессор МГУ"),
  E("Карл Роджерс", "М", "ЗАР", "rogers.webp", "Карл Роджерс, рисованный портрет", "Портрет: Didius, CC BY 2.5", "Психолог, основатель клиент-центрированной терапии, автор книги «О становлении личностью»"),
  E("Ирвин Ялом", "М", "ЗАР", null, "Портрет Ирвина Ялома", "Фото: Haemmerli, CC BY-SA 4.0", "Психиатр, экзистенциальный психотерапевт, почётный профессор Стэнфордского университета"),
  E("Эрих Фромм", "М", "ЗАР", "fromm.webp", "Портрет Эриха Фромма", "Фото: Müller-May, CC BY-SA 3.0 de", "Психоаналитик, социальный психолог, автор книги «Искусство любить»"),
  E("Джон Готтман", "М", "ЗАР", "gottman.webp", "Портрет Джона Готтмана", "Фото: Tkunovsky, CC0", "Психолог, PhD, исследователь отношений, почётный профессор Вашингтонского университета"),
  E("Пол Гилберт", "М", "ЗАР", null, "Портрет Пола Гилберта", "Фото: JonRhodes, CC BY-SA 3.0", "Профессор клинической психологии, создатель терапии, сфокусированной на сострадании"),
  E("Брене Браун", "Ж", "ЗАР", "brown.webp", "Портрет Брене Браун", "Фото: Dell Inc., CC BY 2.0", "Исследовательница стыда и уязвимости, профессор Хьюстонского университета"),
  E("Кэрол Дуэк", "Ж", "ЗАР", "dweck.webp", "Портрет Кэрол Дуэк", "Фото: Satheesh Gopalan, CC BY-SA 3.0", "Психолог, профессор Стэнфордского университета, автор книги «Гибкое сознание»"),
  E("Эстер Перель", "Ж", "ЗАР", "perel.webp", "Портрет Эстер Перель", "Фото: PopTech, CC BY-SA 2.0", "Психотерапевт, специалист по отношениям в паре, автор книги «Право на измену»"),
  E("Сьюзан Дэвид", "Ж", "ЗАР", "susan-david.webp", "Портрет Сьюзан Дэвид", "Фото: Fulwilerm, CC BY-SA 4.0", "Психолог, Гарвардская медицинская школа, автор книги «Эмоциональная гибкость»"),
  E("Вирджиния Сатир", "Ж", "ЗАР", null, "Портрет Вирджинии Сатир", "Фото: William Meyer, общественное достояние", "Семейный психотерапевт, автор книги «Как строить себя и свою семью»"),
  // «Расширение пула, 2026-10-23» (EXPERTS_RU.md № 21–40): portraits from Commons, credits from
  // sz-experts/photos/LICENSES.md; the site files public/media/experts/<slug>.webp come with the
  // separate sergey-zoya-site portraits PR.
  E("Блюма Зейгарник", "Ж", "РУ", "zeigarnik.webp", "Портрет Блюмы Зейгарник", "Фото: Andrey Zeigarnik, общественное достояние", "Психолог, основательница советской патопсихологии, профессор МГУ"),
  E("Рада Грановская", "Ж", "РУ", "granovskaya.webp", "Портрет Рады Грановской", "Фото: Третьяков Дмитрий Витальевич, CC BY-SA 3.0", "Психолог, доктор психологических наук, профессор СПбГУ, автор книги «Элементы практической психологии»"),
  E("Галина Андреева", "Ж", "РУ", "andreeva.webp", "Портрет Галины Андреевой", "Фото: Маниту, CC BY-SA 3.0", "Социальный психолог, профессор МГУ, академик РАО, автор учебника «Социальная психология»"),
  E("Елена Сапогова", "Ж", "РУ", "sapogova.webp", "Портрет Елены Сапоговой", "Фото: Gelingvistoj, CC BY-SA 4.0", "Психолог, доктор психологических наук, профессор МПГУ, автор книги «Экзистенциальная психология взрослости»"),
  E("Вероника Нуркова", "Ж", "РУ", "nourkova.webp", "Портрет Вероники Нурковой", "Фото: Carpodacus, CC BY-SA 4.0", "Психолог, доктор психологических наук, исследовательница автобиографической памяти, профессор МГУ"),
  E("Леонид Кроль", "М", "РУ", "krol.webp", "Портрет Леонида Кроля", "Фото: Maria.adpr, CC BY-SA 4.0", "Психотерапевт, кандидат медицинских наук, профессор НИУ ВШЭ, автор книги «Жизнь без выгорания»"),
  E("Вадим Петровский", "М", "РУ", "petrovsky.webp", "Портрет Вадима Петровского", "Фото: Terekhov600, CC BY-SA 4.0", "Психолог, доктор психологических наук, член-корреспондент РАО, профессор НИУ ВШЭ"),
  E("Михаил Решетников", "М", "РУ", "reshetnikov.webp", "Портрет Михаила Решетникова", "Фото: Svetaerch, CC BY-SA 3.0", "Психоаналитик, доктор психологических наук, ректор Восточно-Европейского института психоанализа, автор книги «Психическая травма»"),
  E("Игорь Вачков", "М", "РУ", "vachkov.webp", "Портрет Игоря Вачкова", "Фото: Гукасова Марина Павловна, CC BY-SA 4.0", "Психолог, доктор психологических наук, профессор, автор книги «Сказкотерапия»"),
  E("Игорь Кон", "М", "РУ", "kon.webp", "Портрет Игоря Кона", "Фото: Dmitry Rozhkov, CC BY-SA 3.0", "Социолог и психолог, академик РАО, автор книг «Дружба» и «Открытие „Я“»"),
  E("Лиза Фельдман Барретт", "Ж", "ЗАР", "feldman-barrett.webp", "Портрет Лизы Фельдман Барретт", "Фото: Max Lonzanida, U.S. Navy, общественное достояние", "Психолог, PhD, профессор Северо-Восточного университета, автор книги «Как рождаются эмоции»"),
  E("Барбара Фредриксон", "Ж", "ЗАР", "fredrickson.webp", "Портрет Барбары Фредриксон", "Фото: Gabriella Clare Marino, CC BY-SA 4.0", "Психолог, PhD, профессор Университета Северной Каролины, исследовательница позитивных эмоций"),
  E("Эллен Лангер", "Ж", "ЗАР", "langer.webp", "Портрет Эллен Лангер", "Фото: Robert Scoble, CC BY 2.0", "Психолог, PhD, профессор Гарвардского университета, автор книги «Осознанность»"),
  E("Соня Любомирски", "Ж", "ЗАР", "lyubomirsky.webp", "Портрет Сони Любомирски", "Фото: Shokc, CC BY-SA 4.0", "Психолог, PhD, профессор Калифорнийского университета в Риверсайде, автор книги «Психология счастья»"),
  E("Лори Сантос", "Ж", "ЗАР", "santos.webp", "Портрет Лори Сантос", "Фото: Oregon State University, CC BY-SA 2.0", "Психолог, PhD, профессор Йельского университета, автор курса «Психология и хорошая жизнь»"),
  E("Михай Чиксентмихайи", "М", "ЗАР", "csikszentmihalyi.webp", "Портрет Михая Чиксентмихайи", "Фото: Ehirsh, общественное достояние", "Психолог, PhD, один из основателей позитивной психологии, автор книги «Поток»"),
  E("Ролло Мэй", "М", "ЗАР", "rollo-may.webp", "Портрет Ролло Мэя", "Фото: неизвестный фотограф, ежегодник Alcalá Университета Сан-Диего, общественное достояние", "Экзистенциальный психолог и психотерапевт, автор книги «Смысл тревоги»"),
  E("Дэниел Сигел", "М", "ЗАР", "siegel.webp", "Портрет Дэниела Сигела", "Фото: Gage Skidmore, CC BY-SA 3.0", "Психиатр и психотерапевт, клинический профессор психиатрии Калифорнийского университета в Лос-Анджелесе"),
  E("Джек Корнфилд", "М", "ЗАР", "kornfield.webp", "Портрет Джека Корнфилда", "Фото: Marcy Harbut, CC BY 2.0", "Клинический психолог, PhD, учитель медитации, автор книги «Путь с сердцем»"),
  E("Пол Экман", "М", "ЗАР", "ekman.webp", "Портрет Пола Экмана", "Фото: Paul Ekman Group, LLC, CC BY-SA 3.0", "Психолог, PhD, почётный профессор Калифорнийского университета в Сан-Франциско, исследователь эмоций"),
];

// Machine-checkable parts of the «Осторожно:» lines (the full cautions go into the prompt).
// Pairs that must not stand side by side in one article without explanation:
export const CONFLICTING_EXPERTS = [["Лиза Фельдман Барретт", "Пол Экман"]];
// Claims banned in an article that cites the expert:
export const EXPERT_BANS = {
  "Барбара Фредриксон": [{ name: "коэффициент позитивности 3:1 (опровергнут)", re: /3\s*[:к]\s*1|коэффициент позитивности|соотношени[а-яё]* позитив/iu }],
  "Дэниел Сигел": [{ name: "Сигел – психиатр, а не психолог", re: /психолог[а-яё]*\s+(?:Дэниел[а-яё]*\s+)?Сигел/iu }],
  "Пол Экман": [{ name: "детекция лжи по микровыражениям оспаривается", re: /распозна[а-яё]*\s+(?:ложь|лжец|обман)|детект[а-яё]*\s+лжи|микровыражени[а-яё]*\s+выда/iu }],
  "Блюма Зейгарник": [{ name: "эффект Зейгарник – тенденция, а не закон", re: /закон\s+Зейгарник/iu }],
  "Лиза Фельдман Барретт": [],
};

const ITEM = /^\s*\d+\.\s+\*\*([^*]+?)\*\*\s*\[\s*(Ж|М)\s*[,/]\s*(РУ|ЗАР)\s*\]:?\s*(.*)$/u;

/** Parses EXPERTS_RU.md: every numbered «**Имя** [Ж, РУ]: …» item in any section. */
export function parseExpertsMd(text) {
  const pool = new Map();
  let section = "";
  let current = null;
  for (const line of String(text).split("\n")) {
    const heading = line.match(/^#{2,3}\s+(.+)$/);
    if (heading) {
      section = heading[1].trim();
      current = null;
      continue;
    }
    const item = line.match(ITEM);
    if (item) {
      const [, name, gender, group, summary] = item;
      current = { name: name.trim(), gender, group, summary: summary.trim(), caution: "", section };
      pool.set(current.name, current);
      continue;
    }
    const caution = line.match(/^\s+Осторожно:\s*(.+)$/);
    if (current && caution && !/^нет\.?$/i.test(caution[1].trim())) current.caution = caution[1].trim();
  }
  return pool;
}

export function loadExpertPool(path = process.env.WRITER_SZ_EXPERTS || BUNDLED_EXPERTS_PATH) {
  const pool = parseExpertsMd(readFileSync(path, "utf8"));
  if (pool.size < 4) throw new Error(`${path}: в пуле экспертов найдено ${pool.size} человек – формат «N. **Имя** [Ж, РУ]: …» не распознан`);
  return pool;
}

let defaultPool = null;
export function defaultExpertPool() {
  defaultPool ??= loadExpertPool();
  return defaultPool;
}

const KNOWN_BY_NAME = new Map(KNOWN_CARDS.map((card) => [card.name, card]));

/**
 * Card for an expert: published site card (ctx.expertCards) → KNOWN_CARDS → brief `card` override.
 * Returns null fields when nothing is known (the brief must then supply them).
 */
export function expertCard(name, { siteCards, override } = {}) {
  const site = siteCards?.get(name);
  const known = KNOWN_BY_NAME.get(name);
  const pick = (key) => override?.[key] || site?.[key] || known?.[key] || null;
  return { name, photo: pick("photo"), alt: pick("alt"), credit: pick("credit"), role: pick("role") };
}

/** Ж/М/РУ/ЗАР mix of one article (Sergey: ≥1 of each). Returns the missing tags. */
export function missingMix(names, pool = defaultExpertPool()) {
  const tags = names.flatMap((name) => {
    const expert = pool.get(name);
    return expert ? [expert.gender, expert.group] : [];
  });
  return ["Ж", "М", "РУ", "ЗАР"].filter((tag) => !tags.includes(tag));
}

/** Rotation across a pack (Sergey: one expert in at most two articles of a pack). */
export function rotationProblems(articles, max = 2) {
  const usage = new Map();
  for (const article of articles) {
    for (const name of new Set(article.experts.map((expert) => expert.name))) usage.set(name, (usage.get(name) ?? 0) + 1);
  }
  return [...usage].filter(([, count]) => count > max).map(([name, count]) => `ротация: «${name}» в ${count} статьях пакета (максимум ${max})`);
}

/** Experts of the pool ranked by site usage (least used first) – the order the writer prefers. */
export function rankExperts(pool, usage = new Map()) {
  return [...pool.values()]
    .map((expert) => ({ ...expert, used: usage.get(expert.name) ?? 0 }))
    .sort((a, b) => a.used - b.used || a.name.localeCompare(b.name, "ru"));
}

/**
 * Rotation preference: warn when a brief picks an expert noticeably more used on the site than
 * the least-used expert of the same Ж/М + РУ/ЗАР cell (with a portrait). `slack` = tolerated gap.
 */
export function rotationAdvice(articles, pool, usage, { hasPortrait = () => true, portraitOnSite = () => true, slack = 2 } = {}) {
  const advice = [];
  const ranked = rankExperts(pool, usage).filter((expert) => hasPortrait(expert.name));
  const chosen = new Set(articles.flatMap((article) => article.experts.map((expert) => expert.name)));
  for (const article of articles) {
    for (const { name } of article.experts) {
      const expert = pool.get(name);
      if (!expert) continue;
      const used = usage.get(name) ?? 0;
      const fresher = ranked.filter((other) => other.gender === expert.gender && other.group === expert.group && !chosen.has(other.name) && other.used + slack < used);
      if (fresher.length) {
        advice.push(`${article.slug}: «${name}» уже в ${used} статьях сайта; реже используются (${expert.gender}, ${expert.group}): ${fresher.slice(0, 3).map((other) => `${other.name} – ${other.used}${portraitOnSite(other.name) ? "" : " (портрета ещё нет на сайте: card.photoFile в брифе или PR с портретами)"}`).join(", ")}`);
      }
    }
  }
  return advice;
}
