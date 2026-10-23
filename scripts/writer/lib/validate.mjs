// Deterministic validators for a «Райтер» article. No network unless options.live is set.
import { ALLOWED_EXTERNAL_HOSTS, EM_DASH, hostOf, isAllowedExternal } from "./util.mjs";

const SECTION_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// A promise is excused only by a direct negation right before it: the negation word, then at
// most one word, then the promise («не исцелит», «не может гарантировать», «без гарантий»).
// A negation elsewhere in the sentence («это не сложно, и молитва исцелит») does not count.
const DIRECT_NEGATION_RE = /(?:^|[^а-яё])(?:не|ни|без|нет|никаких|никакой|никакого|никаким|вместо|невозможно|нельзя)\s+(?:[а-яё]+\s+)?$/iu;

/** Promise patterns that are forbidden unless negated nearby or inside a verified quote. */
export const PROMISE_PATTERNS = [
  { name: "исцеление", re: /исцел[а-яё]*/giu },
  { name: "излечение", re: /(?:из|вы)леч[а-яё]*/giu },
  { name: "лечит", re: /(?<![а-яё])леч(?:ит|ат|ение болезн)[а-яё]*/giu },
  { name: "гарантия", re: /гарант[а-яё]*/giu },
  { name: "защита", re: /(?<![а-яё])защ(?:ит|ищ)[а-яё]*/giu },
  { name: "оберегает", re: /оберега(?:ет|ют)|убереж[а-яё]*|уберег[а-яё]*/giu },
  { name: "избавит от", re: /избав(?:ит|ят|ляет|ляют) от/giu },
  { name: "исполнение желаний", re: /исполн(?:ит|ят|яет|яют|ится|ятся|ение)\s+(?:[а-яё]+\s+){0,2}желани[а-яё]*/giu },
  { name: "100%", re: /100\s*%/gu },
  { name: "точно/обязательно поможет", re: /(?:точно|обязательно|непременно|гарантированно)\s+(?:поможет|сработает|исполнится|изменит)/giu },
  { name: "привлечёт деньги/удачу", re: /привлеч[её]т\s+(?:деньги|удачу|любовь|богатство)/giu },
  { name: "спасёт от", re: /спас[её]т от/giu },
  { name: "навсегда избавиться", re: /навсегда\s+избав[а-яё]*/giu },
];

const HYGIENE = [
  { name: "HTML-тег", re: /<\/?[a-z][^>]*>/i },
  { name: "Markdown-разметка", re: /\*\*|\]\(|^#{1,6}\s|`/m },
  { name: "латинский бренд AudioLad", re: /audiolad(?!\.ru)/i },
  { name: "U+2011/U+2010", re: /[\u2010\u2011]/ },
];

const TEXT_ADDRESS_PATTERNS = [
  { name: "e-mail", re: /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.\p{L}{2,}/gu, always: true },
  { name: "ссылка mailto:/tel:", re: /\b(?:mailto|tel|sms|tg|whatsapp|viber|skype):[^\s«»"]*/giu, always: true },
  { name: "адрес сайта", re: /(?:https?:)?\/\/[^\s«»"()<>]+/giu },
  { name: "адрес сайта", re: /(?<![\p{L}\d@._/-])(?:www\.)?(?:[a-z\d][a-z\d-]*\.)+(?:[a-z]{2,24}|рф)(?![\p{L}\d-])(?:\/[^\s«»"()<>]*)?/giu },
  { name: "адрес сайта", re: /(?<![\p{L}\d@._/-])(?:[а-яё\d][а-яё\d-]*\.)+рф(?![\p{L}\d-])(?:\/[^\s«»"()<>]*)?/giu },
];

/**
 * Addresses of other websites in plain text: bare domains (example.com/page, t.me/x),
 * //host/x, http(s)://, mailto:/tel: and e-mails. Plain mentions of audiolad.ru and
 * sergey-zoya.ru (the two allowed sites) are fine; e-mails and mailto: are never allowed.
 */
export function findTextAddresses(text) {
  const problems = [];
  const taken = [];
  for (const pattern of TEXT_ADDRESS_PATTERNS) {
    for (const match of text.matchAll(pattern.re)) {
      const start = match.index;
      const end = start + match[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      const raw = match[0].replace(/[.,;:!?…]+$/u, "");
      if (!pattern.always) {
        const url = /^https?:/i.test(raw) ? raw : raw.startsWith("//") ? `https:${raw}` : `https://${raw}`;
        const host = hostOf(url);
        if (host && (host === "audiolad.ru" || ALLOWED_EXTERNAL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)))) continue;
      }
      problems.push(`${pattern.name} в тексте: ${raw.slice(0, 60)}`);
    }
  }
  return problems;
}

function collectStrings(article) {
  const out = [];
  const push = (path, text, kind = "text") => {
    if (typeof text === "string") out.push({ path, text, kind });
  };
  for (const field of ["title", "breadcrumbTitle", "metaTitle", "metaDescription", "leadBeforeAudio", "shortAnswer", "primaryPracticeIntro"]) {
    push(field, article[field], "meta");
  }
  (article.introAfterAudio ?? []).forEach((text, i) => push(`introAfterAudio[${i}]`, text, "body"));
  (article.sections ?? []).forEach((section, si) => {
    push(`sections[${si}].title`, section?.title, "body");
    (section?.blocks ?? []).forEach((block, bi) => {
      const base = `sections[${si}].blocks[${bi}]`;
      if (block?.kind === "paragraph") push(base, block.text, "body");
      if (block?.kind === "heading") push(base, block.title, "body");
      if (block?.kind === "list") (block.items ?? []).forEach((item, ii) => push(`${base}.items[${ii}]`, item, "body"));
      if (block?.kind === "rich_paragraph") {
        const text = (block.segments ?? []).map((s) => s?.text ?? s?.strong ?? s?.label ?? "").join("");
        push(base, text, "body");
      }
      if (block?.kind === "table") {
        push(`${base}.caption`, block.caption, "body");
        (block.columns ?? []).forEach((c, ci) => push(`${base}.columns[${ci}]`, c, "body"));
        (block.rows ?? []).forEach((row, ri) => (row ?? []).forEach((c, ci) => push(`${base}.rows[${ri}][${ci}]`, c, "body")));
      }
    });
  });
  (article.faq ?? []).forEach((item, i) => {
    push(`faq[${i}].question`, item?.question, "faq");
    push(`faq[${i}].answer`, item?.answer, "faq");
  });
  (article.closingSection?.paragraphs ?? []).forEach((text, i) => push(`closingSection[${i}]`, text, "body"));
  Object.entries(article.relatedPracticeBlurbs ?? {}).forEach(([key, text]) => push(`relatedPracticeBlurbs.${key}`, text, "meta"));
  (article.seeAlsoLinks ?? []).forEach((link, i) => {
    push(`seeAlsoLinks[${i}].title`, link?.title, "meta");
    push(`seeAlsoLinks[${i}].description`, link?.description, "meta");
  });
  return out;
}

export function collectLinks(article) {
  const links = [];
  (article.sections ?? []).forEach((section, si) =>
    (section?.blocks ?? []).forEach((block, bi) => {
      if (block?.kind !== "rich_paragraph") return;
      (block.segments ?? []).forEach((segment, gi) => {
        if (segment && "href" in segment) {
          links.push({ path: `sections[${si}].blocks[${bi}].segments[${gi}]`, href: segment.href, label: segment.label, where: "body" });
        }
      });
    }),
  );
  (article.seeAlsoLinks ?? []).forEach((link, i) => links.push({ path: `seeAlsoLinks[${i}]`, href: link?.href, where: "seeAlso" }));
  return links;
}

function words(text) {
  return text.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? [];
}

function normQuote(text) {
  return text.replace(/\s+/g, " ").replace(/[«»„“”"]/g, "").trim().replace(/[.,;:!?…]+$/u, "");
}

function bigrams(text) {
  const tokens = words(text.toLowerCase());
  const set = new Set();
  for (let i = 0; i + 1 < tokens.length; i += 1) set.add(`${tokens[i]} ${tokens[i + 1]}`);
  return set;
}

function isVerbatim(quote, sources) {
  const candidate = normQuote(quote);
  if (!candidate) return true;
  return sources.some((source) => {
    const haystack = source.text.replace(/\s+/g, " ");
    if (haystack.includes(candidate)) return true;
    // A quote may start mid-sentence, so the case of the first letter may differ.
    const first = candidate[0];
    const rest = candidate.slice(1);
    return haystack.includes(first.toLowerCase() + rest) || haystack.includes(first.toUpperCase() + rest);
  });
}

function lengthCheck(errors, field, value, min, max) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${field}: обязательное непустое поле`);
    return;
  }
  if (value.length < min || value.length > max) {
    errors.push(`${field}: длина ${value.length}, нужно ${min}–${max} символов`);
  }
}

function inRange(errors, field, count, range) {
  if (count < range.min || count > range.max) errors.push(`${field}: ${count}, нужно ${range.min}–${range.max}`);
}

function lower(text) {
  return text.toLowerCase().replace(/ё/g, "е");
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function canonicalPath(href) {
  if (typeof href !== "string") return null;
  return href.replace(/^https:\/\/audiolad\.ru(?=\/)/, "");
}

/** Structure, lengths, counts. */
function checkStructure(article, brief, context, errors, warnings) {
  if (!article || typeof article !== "object" || Array.isArray(article)) {
    errors.push("ответ не является JSON-объектом");
    return false;
  }
  lengthCheck(errors, "title", article.title, 20, 110);
  lengthCheck(errors, "breadcrumbTitle", article.breadcrumbTitle, 3, 45);
  lengthCheck(errors, "metaTitle", article.metaTitle, 25, 70);
  lengthCheck(errors, "metaDescription", article.metaDescription, 110, 175);
  lengthCheck(errors, "leadBeforeAudio", article.leadBeforeAudio, 80, 700);
  lengthCheck(errors, "shortAnswer", article.shortAnswer, 80, 700);
  lengthCheck(errors, "primaryPracticeIntro", article.primaryPracticeIntro, 30, 400);
  if (typeof article.metaTitle === "string" && !article.metaTitle.endsWith(" – АудиоЛад")) {
    errors.push("metaTitle: должен заканчиваться « – АудиоЛад»");
  }
  if (!Array.isArray(article.introAfterAudio) || article.introAfterAudio.length < 1 || article.introAfterAudio.length > 4) {
    errors.push("introAfterAudio: 1–4 абзаца");
  }
  const sections = Array.isArray(article.sections) ? article.sections : [];
  inRange(errors, "sections", sections.length, brief.sections);
  const ids = new Set();
  let tables = 0;
  sections.forEach((section, si) => {
    const base = `sections[${si}]`;
    if (!section || typeof section !== "object") {
      errors.push(`${base}: не объект`);
      return;
    }
    if (!SECTION_ID_RE.test(section.id ?? "") || section.id === "glavnoe") errors.push(`${base}.id: латиница через дефис, не «glavnoe»`);
    if (ids.has(section.id)) errors.push(`${base}.id: повтор «${section.id}»`);
    ids.add(section.id);
    lengthCheck(errors, `${base}.title`, section.title, 3, 120);
    const blocks = Array.isArray(section.blocks) ? section.blocks : [];
    if (blocks.length < 1) errors.push(`${base}.blocks: хотя бы один блок`);
    blocks.forEach((block, bi) => {
      const path = `${base}.blocks[${bi}]`;
      switch (block?.kind) {
        case "paragraph":
          if (typeof block.text !== "string" || !block.text.trim()) errors.push(`${path}: пустой абзац`);
          break;
        case "heading":
          if (block.level !== 3 || typeof block.title !== "string" || !block.title.trim()) errors.push(`${path}: H3 с level 3 и title`);
          break;
        case "list":
          if (!Array.isArray(block.items) || block.items.length < 2 || block.items.length > 10 || block.items.some((i) => typeof i !== "string" || !i.trim())) {
            errors.push(`${path}: список из 2–10 непустых пунктов`);
          }
          break;
        case "rich_paragraph": {
          const segments = Array.isArray(block.segments) ? block.segments : [];
          if (!segments.length) errors.push(`${path}: пустые segments`);
          segments.forEach((segment, gi) => {
            const keys = Object.keys(segment ?? {}).sort().join(",");
            if (!["text", "strong", "href,label"].includes(keys)) errors.push(`${path}.segments[${gi}]: допустимо {text} | {strong} | {href,label}`);
            if ("label" in (segment ?? {}) && !String(segment.label).trim()) errors.push(`${path}.segments[${gi}]: пустой label`);
          });
          break;
        }
        case "table": {
          tables += 1;
          if (!context.supportsTable) {
            errors.push(`${path}: блок table не поддерживается этой версией сайта`);
            break;
          }
          const columns = Array.isArray(block.columns) ? block.columns : [];
          const rows = Array.isArray(block.rows) ? block.rows : [];
          if (columns.length < 2 || columns.length > 4) errors.push(`${path}: 2–4 колонки`);
          if (brief.table.columns && JSON.stringify(columns) !== JSON.stringify(brief.table.columns)) {
            errors.push(`${path}: колонки должны быть ${brief.table.columns.join(" | ")}`);
          }
          inRange(errors, `${path}.rows`, rows.length, brief.table.rows);
          rows.forEach((row, ri) => {
            if (!Array.isArray(row) || row.length !== columns.length || row.some((c) => typeof c !== "string" || !c.trim())) {
              errors.push(`${path}.rows[${ri}]: ${columns.length} непустых ячеек`);
            }
          });
          break;
        }
        default:
          errors.push(`${path}: неизвестный kind «${block?.kind}»`);
      }
    });
  });
  if (brief.table.mode === "required" && tables !== 1) errors.push(`таблица: нужна ровно одна, найдено ${tables}`);
  if (brief.table.mode !== "required" && tables > 1) errors.push(`таблица: не больше одной, найдено ${tables}`);
  if (brief.table.mode === "forbidden" && tables > 0) errors.push("таблица запрещена брифом");

  const faq = Array.isArray(article.faq) ? article.faq : [];
  inRange(errors, "faq", faq.length, brief.faq);
  faq.forEach((item, i) => {
    lengthCheck(errors, `faq[${i}].question`, item?.question, 10, 200);
    lengthCheck(errors, `faq[${i}].answer`, item?.answer, 40, 800);
    if (typeof item?.question === "string" && !item.question.trim().endsWith("?")) errors.push(`faq[${i}].question: должен заканчиваться «?»`);
  });
  const closing = article.closingSection?.paragraphs;
  if (!Array.isArray(closing) || closing.length < 1 || closing.length > 3 || closing.some((p) => typeof p !== "string" || !p.trim())) {
    errors.push("closingSection.paragraphs: 1–3 непустых абзаца");
  }
  const blurbs = article.relatedPracticeBlurbs ?? {};
  const expected = brief.relatedPractices.map((p) => p.key).sort();
  if (JSON.stringify(Object.keys(blurbs).sort()) !== JSON.stringify(expected)) {
    errors.push(`relatedPracticeBlurbs: ключи должны быть ровно ${expected.join(", ") || "(пусто)"}`);
  }
  for (const [key, text] of Object.entries(blurbs)) lengthCheck(errors, `relatedPracticeBlurbs.${key}`, text, 10, 220);

  const seeAlso = Array.isArray(article.seeAlsoLinks) ? article.seeAlsoLinks : [];
  inRange(errors, "seeAlsoLinks", seeAlso.length, brief.seeAlso);
  seeAlso.forEach((link, i) => {
    lengthCheck(errors, `seeAlsoLinks[${i}].title`, link?.title, 5, 140);
    lengthCheck(errors, `seeAlsoLinks[${i}].description`, link?.description, 20, 300);
  });
  if (new Set(seeAlso.map((l) => l?.href)).size !== seeAlso.length) errors.push("seeAlsoLinks: повтор href");

  const extra = Object.keys(article).filter(
    (key) => !["title", "breadcrumbTitle", "metaTitle", "metaDescription", "leadBeforeAudio", "shortAnswer", "primaryPracticeIntro", "introAfterAudio", "sections", "faq", "closingSection", "relatedPracticeBlurbs", "seeAlsoLinks"].includes(key),
  );
  if (extra.length) warnings.push(`лишние поля проигнорированы: ${extra.join(", ")}`);
  return true;
}

function checkText(article, brief, strings, errors, warnings, stats) {
  const all = strings.map((s) => s.text).join("\n");
  if (JSON.stringify(article).includes(EM_DASH)) errors.push("найдено длинное тире (U+2014): допускается только «–»");
  for (const item of strings) {
    for (const rule of HYGIENE) {
      if (rule.re.test(item.text)) errors.push(`${item.path}: ${rule.name}`);
    }
    if ((item.text.match(/«/g) ?? []).length !== (item.text.match(/»/g) ?? []).length) {
      warnings.push(`${item.path}: несбалансированные «ёлочки»`);
    }
    if (/"/.test(item.text)) warnings.push(`${item.path}: прямые кавычки "…" вместо «ёлочек»`);
  }
  for (const phrase of brief.forbiddenPhrases) {
    if (lower(all).includes(lower(phrase))) errors.push(`запрещённая брифом фраза: «${phrase}»`);
  }

  // Addresses in plain text count as links to other websites too (owner rule 23.10).
  for (const item of strings) {
    for (const problem of findTextAddresses(item.text)) {
      errors.push(`${item.path}: ${problem} – источник называйте без ссылки и адреса`);
    }
  }

  // Text that points to a table must have one (seen in a dry run: the table got lost in repair).
  const hasTable = (article.sections ?? []).some((section) => (section?.blocks ?? []).some((block) => block?.kind === "table"));
  if (!hasTable && /(таблиц[аеуы]? ниже|в таблице ниже|ниже в таблице|следующ[а-я]+ таблиц)/iu.test(all)) {
    errors.push("текст ссылается на таблицу («таблица ниже»), но блока table нет");
  }

  // Word count (body without FAQ and meta fields, plus lead).
  const bodyText = [article.leadBeforeAudio ?? "", ...strings.filter((s) => s.kind === "body").map((s) => s.text)].join(" ");
  stats.words = words(bodyText).length;
  if (stats.words < brief.wordCount.min || stats.words > brief.wordCount.max) {
    errors.push(`объём основного текста: ${stats.words} слов, нужно ${brief.wordCount.min}–${brief.wordCount.max}`);
  }

  // Keywords.
  const key = lower(brief.primaryKeyword);
  for (const field of ["title", "metaTitle", "metaDescription"]) {
    if (typeof article[field] === "string" && !lower(article[field]).includes(key)) {
      errors.push(`${field}: нет главного ключа «${brief.primaryKeyword}»`);
    }
  }
  const bodyLower = lower(bodyText + " " + strings.filter((s) => s.kind === "faq").map((s) => s.text).join(" "));
  stats.primaryKeywordInBody = countOccurrences(bodyLower, key);
  if (stats.primaryKeywordInBody < 1) errors.push(`главный ключ «${brief.primaryKeyword}» не встречается в тексте`);
  if (stats.primaryKeywordInBody > 8) warnings.push(`главный ключ встречается ${stats.primaryKeywordInBody} раз – возможен переспам`);
  for (const secondary of brief.secondaryKeywords) {
    if (!bodyLower.includes(lower(secondary)) && !lower(all).includes(lower(secondary))) {
      warnings.push(`дополнительный ключ «${secondary}» не найден`);
    }
  }
}

function checkQuotes(brief, strings, errors, warnings, stats) {
  const sources = brief.sources;
  const verbatimTexts = [];
  stats.quotes = { verbatim: 0, short: 0 };
  for (const item of strings) {
    // «ёлочки», straight "…" and „…“ / “…” quotes all go through the same verbatim check.
    for (const match of item.text.matchAll(/«([^«»]+)»|"([^"]+)"|„([^„“”]+)[“”]|“([^“”]+)”/g)) {
      const quote = match[1] ?? match[2] ?? match[3] ?? match[4];
      const count = words(quote).length;
      if (count < 4) continue;
      if (isVerbatim(quote, sources)) {
        stats.quotes.verbatim += 1;
        verbatimTexts.push(quote);
        continue;
      }
      const qb = bigrams(quote);
      const overlap = Math.max(
        0,
        ...sources.map((source) => {
          const sb = bigrams(source.text);
          let hit = 0;
          for (const pair of qb) if (sb.has(pair)) hit += 1;
          return qb.size ? hit / qb.size : 0;
        }),
      );
      if (overlap >= 0.5) {
        errors.push(`${item.path}: цитата «${quote.slice(0, 80)}…» похожа на источник, но не дословна`);
      } else if (count >= 12) {
        errors.push(`${item.path}: длинная цитата без источника в материалах: «${quote.slice(0, 80)}…»`);
      } else {
        stats.quotes.short += 1;
      }
    }
  }
  const allText = strings.map((s) => s.text).join("\n").replace(/\s+/g, " ");
  for (const id of brief.requiredQuotes) {
    const source = sources.find((s) => s.id === id);
    const text = normQuote(source.text);
    if (!allText.includes(text)) errors.push(`обязательная дословная цитата [${id}] «${source.title}» отсутствует или изменена`);
  }
  return verbatimTexts;
}

function checkPromises(strings, verbatimQuotes, errors) {
  for (const item of strings) {
    let text = item.text;
    for (const quote of verbatimQuotes) text = text.split(quote).join(" ");
    for (const pattern of PROMISE_PATTERNS) {
      for (const match of text.matchAll(pattern.re)) {
        const before = text.slice(Math.max(0, match.index - 40), match.index);
        if (DIRECT_NEGATION_RE.test(before)) continue;
        // A yes/no question about the promise («Гарантирует ли практика…?») is not a promise.
        if (/^\s+ли(?![а-яё])/iu.test(text.slice(match.index + match[0].length))) continue;
        errors.push(`${item.path}: запрещённое обещание (${pattern.name}): «${text.slice(Math.max(0, match.index - 30), match.index + match[0].length + 20).trim()}»`);
      }
    }
  }
}

function checkLinks(article, brief, context, errors, warnings, stats, liveTargets) {
  const links = collectLinks(article);
  const practiceByHref = new Map([brief.primaryPractice, ...brief.relatedPractices].map((p) => [p.href, p]));
  const allowedInternal = new Set(brief.internalLinks.map((l) => l.href));
  const externals = new Set(brief.externalLinks.map((u) => u.replace(/\/$/, "")));
  const articleTargets = new Set();
  const bodyArticleTargets = new Set();
  let primaryLinked = false;
  for (const link of links) {
    const href = link.href;
    if (typeof href !== "string" || !href) {
      errors.push(`${link.path}: пустой href`);
      continue;
    }
    if (/^\/\//.test(href) || (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:\/\//i.test(href))) {
      errors.push(`${link.path}: недопустимая ссылка ${href}`);
      continue;
    }
    if (/^https?:\/\//i.test(href) && !href.startsWith("https://audiolad.ru/")) {
      if (link.where === "seeAlso") errors.push(`${link.path}: в «Смотрите также» только статьи АудиоЛада`);
      else if (!isAllowedExternal(href)) {
        errors.push(`${link.path}: внешняя ссылка на другой сайт запрещена (${hostOf(href) ?? href}); разрешены только audiolad.ru и ${ALLOWED_EXTERNAL_HOSTS.join(", ")}, источники – только названием в тексте`);
      } else if (!externals.has(href.replace(/\/$/, ""))) errors.push(`${link.path}: внешняя ссылка не из брифа: ${href}`);
      else liveTargets.add(href);
      continue;
    }
    const path = canonicalPath(href);
    if (!path?.startsWith("/") || /[?#\s]/.test(path)) {
      errors.push(`${link.path}: недопустимый href ${href}`);
      continue;
    }
    const articleSlug = path.match(/^\/articles\/([a-z0-9-]+)\/?$/)?.[1];
    if (articleSlug) {
      if (articleSlug === brief.slug) errors.push(`${link.path}: ссылка на саму статью`);
      else if (!context.articleBySlug.has(articleSlug)) errors.push(`${link.path}: статья ${path} не существует в реестре`);
      else if (!allowedInternal.has(`/articles/${articleSlug}`)) errors.push(`${link.path}: статья ${path} не входит в разрешённые брифом`);
      else {
        articleTargets.add(articleSlug);
        if (link.where === "body") bodyArticleTargets.add(articleSlug);
      }
      continue;
    }
    if (link.where === "seeAlso") {
      errors.push(`${link.path}: в «Смотрите также» только /articles/<slug>`);
      continue;
    }
    if (path.startsWith("/practice/")) {
      if (!practiceByHref.has(path)) errors.push(`${link.path}: практика ${path} не из брифа`);
      else liveTargets.add(`https://audiolad.ru${path}`);
      if (path === brief.primaryPractice.href) primaryLinked = true;
      continue;
    }
    if (!allowedInternal.has(path)) errors.push(`${link.path}: внутренняя ссылка ${path} не разрешена брифом`);
    else liveTargets.add(`https://audiolad.ru${path}`);
  }
  if (!primaryLinked) errors.push(`нет ссылки на основную практику ${brief.primaryPractice.href} в тексте`);
  if (bodyArticleTargets.size < brief.minInternalArticleLinks) {
    errors.push(`ссылок на разные статьи в тексте: ${bodyArticleTargets.size}, нужно ≥ ${brief.minInternalArticleLinks}`);
  }
  stats.links = { total: links.length, articles: articleTargets.size };
  for (const practice of [brief.primaryPractice, ...brief.relatedPractices]) liveTargets.add(`https://audiolad.ru${practice.href}`);
}

function jaccard(a, b) {
  const x = new Set(words(lower(a)));
  const y = new Set(words(lower(b)));
  const inter = [...x].filter((w) => y.has(w)).length;
  return inter / Math.max(1, new Set([...x, ...y]).size);
}

function checkDuplicates(article, brief, context, errors, warnings) {
  if (context.articleBySlug.has(brief.slug)) errors.push(`slug «${brief.slug}» уже есть в реестре статей`);
  if (context.masterArticles.some((entry) => entry.slug === brief.slug)) errors.push(`slug «${brief.slug}» уже есть в операционном мастере`);
  const key = lower(brief.primaryKeyword).trim();
  const clash = context.masterArticles.find((entry) => lower(String(entry.primaryQuery ?? "")).trim() === key);
  if (clash) errors.push(`главный ключ уже закреплён за статьёй ${clash.slug} (дубль интента)`);
  for (const existing of context.articles) {
    if (existing.title === article.title) errors.push(`title совпадает со статьёй ${existing.slug}`);
    if (existing.metaTitle === article.metaTitle) errors.push(`metaTitle совпадает со статьёй ${existing.slug}`);
    if (existing.breadcrumbTitle === article.breadcrumbTitle) errors.push(`breadcrumbTitle совпадает со статьёй ${existing.slug}`);
    if (typeof article.title === "string" && jaccard(existing.title, article.title) >= 0.75) {
      warnings.push(`title очень похож на статью ${existing.slug}: «${existing.title}»`);
    }
  }
}

async function checkLive(targets, errors, warnings, live) {
  const results = [];
  if (!live) {
    if (targets.size) warnings.push(`живая проверка ссылок пропущена (--offline): ${targets.size}`);
    return results;
  }
  for (const url of targets) {
    let status = 0;
    try {
      const response = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(20000) });
      status = response.status;
    } catch {
      status = 0;
    }
    results.push({ url, status });
    if (status !== 200) errors.push(`ссылка ${url} отвечает ${status || "ошибкой сети"}, ожидается 200`);
  }
  return results;
}

/**
 * Removes duplicates and folds runs of the same message that differ only in array
 * indices (e.g. a model loop emitting hundreds of empty paragraphs) into one line.
 */
export function compactMessages(list) {
  const groups = new Map();
  for (const message of new Set(list)) {
    const key = message.replace(/\[\d+\]/g, "[*]");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(message);
  }
  const result = [];
  for (const [key, messages] of groups) {
    if (messages.length <= 3) result.push(...messages);
    else result.push(`${key} (×${messages.length}, первое: ${messages[0].split(":")[0]})`);
  }
  return result;
}

export async function validateArticle(article, brief, context, options = {}) {
  const errors = [];
  const warnings = [];
  const stats = {};
  if (!checkStructure(article, brief, context, errors, warnings)) {
    return { ok: false, errors: compactMessages(errors), warnings: compactMessages(warnings), stats };
  }
  const strings = collectStrings(article);
  checkText(article, brief, strings, errors, warnings, stats);
  const verbatim = checkQuotes(brief, strings, errors, warnings, stats);
  checkPromises(strings, verbatim, errors);
  const liveTargets = new Set();
  checkLinks(article, brief, context, errors, warnings, stats, liveTargets);
  checkDuplicates(article, brief, context, errors, warnings);
  stats.live = await checkLive(liveTargets, errors, warnings, options.live !== false);
  return { ok: errors.length === 0, errors: compactMessages(errors), warnings: compactMessages(warnings), stats };
}
