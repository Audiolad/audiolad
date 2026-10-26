// Tiered repair (--repair-mode tiered only). Deterministic fixes, then one failing
// fragment at a time on the cheap model, then GPT-5.5 for that fragment after N
// misses. The full article is never the request. The full gate runs after each apply.
import { BudgetError } from "../../call.mjs";
import { estimatePromptTokens, worstCaseRub } from "../../cost.mjs";
import { SZ, SZ_BODY_PLAN } from "./config.mjs";
import { normalizeSzFields } from "./assemble.mjs";
import { szH2Count, szQuantityReport } from "./metrics.mjs";
import { SUMMONING, fieldProseDefect, normalize, words } from "./rules.mjs";

const FRAGMENT_SYSTEM = [
  "Ты – Зоя Петрова. Пиши по-русски, на «вы», тепло и ясно.",
  "Только среднее тире «–» и кавычки «».",
  "Без внешних ссылок, адресов, MAX, обещаний исцеления, гарантий, защиты, оберегов и призыва.",
  "Практику не описывай через дискомфорт и не советуй остановить запись.",
  "Не выдумывай факты и не копируй чужие заголовки. Верни только JSON по схеме.",
].join(" ");

const HOMOGLYPHS = { A: "А", a: "а", B: "В", C: "С", c: "с", E: "Е", e: "е", H: "Н", K: "К", M: "М", O: "О", o: "о", P: "Р", p: "р", T: "Т", X: "Х", x: "х", Y: "У", y: "у" };

const objectSchema = (properties) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const stringSchema = { type: "string" };

function mapStrings(value, fn) {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, fn)]));
  return value;
}

export function fixMixedHomoglyphs(text) {
  return String(text).replace(/\p{L}+/gu, (word) => {
    if (!/[A-Za-z]/.test(word) || !/[А-Яа-яЁё]/.test(word)) return word;
    const next = [...word].map((char) => HOMOGLYPHS[char] ?? char).join("");
    return /[A-Za-z]/.test(next) ? word : next;
  });
}

function fixAsciiDash(text) {
  return text.replace(/([а-яё])\s+-\s+([а-яё])/giu, "$1 – $2");
}

function trimChars(text, max) {
  const chars = [...text];
  if (chars.length <= max) return text;
  let cut = chars.slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  if (space >= Math.min(max - 1, 40)) cut = cut.slice(0, space);
  return cut.replace(/[\s,.;:–\-]+$/u, "").trim();
}

function trimSentences(text, maxWords, minWords) {
  const parts = text.split(/(?<=[.!?…])\s+/u);
  while (parts.length > 1 && words(parts.join(" ")) > maxWords) {
    const next = parts.slice(0, -1).join(" ");
    if (words(next) < minWords) break;
    parts.pop();
  }
  return parts.join(" ");
}

function paragraphHollow(text) {
  return Boolean(fieldProseDefect(text, "paragraph"));
}

function foldExtraSection(sections) {
  let index = sections.length - 1;
  let best = Infinity;
  for (let i = 1; i < sections.length; i += 1) {
    const hollow = (sections[i].paragraphs ?? []).every((paragraph) => paragraphHollow(paragraph));
    const weight = hollow ? -1 : words((sections[i].paragraphs ?? []).join(" "));
    if (weight < best) {
      best = weight;
      index = i;
    }
  }
  const extra = sections[index];
  const hollow = (extra.paragraphs ?? []).every((paragraph) => paragraphHollow(paragraph));
  if (!hollow) {
    const prev = sections[index - 1];
    const combined = [...(prev.paragraphs ?? []), ...(extra.paragraphs ?? [])];
    if (combined.length > 12) return null;
    prev.paragraphs = combined;
  }
  const title = extra.title ?? "";
  sections.splice(index, 1);
  return hollow ? `снят пустой лишний H2 «${title}»` : `слит лишний H2 «${title}» с предыдущим разделом`;
}

/** Programmatic fixes. Returns the same fields when nothing was safe to change. */
export function applyDeterministicSzFixes(fields, { query = "" } = {}) {
  const fixes = [];
  let next = mapStrings(structuredClone(fields), (text) => {
    const glyphs = fixMixedHomoglyphs(text);
    const dashed = fixAsciiDash(glyphs);
    if (glyphs !== text) fixes.push("латинская омоглифа внутри кириллического слова заменена");
    if (dashed !== glyphs) fixes.push("дефис между русскими словами заменён на «–»");
    return dashed;
  });
  const beforeNorm = JSON.stringify(next);
  next = normalizeSzFields(next).fields;
  if (beforeNorm.includes("\u2014") && !JSON.stringify(next).includes("\u2014")) fixes.push("длинное тире заменено на «–»");
  const limits = SZ.limits;
  if (typeof next.description === "string" && [...next.description].length > limits.description[1]) {
    const trimmed = trimChars(next.description, limits.description[1]);
    if ([...trimmed].length >= limits.description[0] && normalize(trimmed).includes(normalize(query))) {
      next.description = trimmed;
      fixes.push("description обрезан до 160 символов");
    }
  }
  if (typeof next.seoTitle === "string" && [...next.seoTitle].length > limits.seoTitleMax) {
    const trimmed = trimChars(next.seoTitle, limits.seoTitleMax);
    if (normalize(trimmed).startsWith(normalize(query))) {
      next.seoTitle = trimmed;
      fixes.push("seoTitle обрезан до лимита");
    }
  }
  for (const item of next.faq ?? []) {
    if (words(item.answer) > limits.faqAnswer[1]) {
      const trimmed = trimSentences(item.answer, limits.faqAnswer[1], limits.faqAnswer[0]);
      if (trimmed !== item.answer && words(trimmed) >= limits.faqAnswer[0]) {
        item.answer = trimmed;
        fixes.push("длинный ответ FAQ укорочен по предложениям");
      }
    }
  }
  let guard = 0;
  while (szH2Count(next) > limits.bodyH2[1] && guard < 6) {
    guard += 1;
    const key = next.sectionsAfter?.length ? "sectionsAfter" : (next.sectionsBefore?.length > 2 ? "sectionsBefore" : null);
    if (!key || next[key].length < 2) break;
    const note = foldExtraSection(next[key]);
    if (!note) break;
    fixes.push(note);
  }
  return { fields: next, fixes };
}

function findString(value, pattern, path = "") {
  if (typeof value === "string") return pattern.test(value) ? { path, text: value } : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findString(value[i], pattern, `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const found = findString(item, pattern, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

function setPath(fields, path, text) {
  const next = structuredClone(fields);
  const parts = [...path.matchAll(/([^[\].]+)|\[(\d+)\]/g)].map((match) => (match[1] !== undefined ? match[1] : Number(match[2])));
  let cursor = next;
  for (let i = 0; i < parts.length - 1; i += 1) cursor = cursor[parts[i]];
  cursor[parts.at(-1)] = text;
  return next;
}

function fragment(key, instructions, schema, apply) {
  return {
    key,
    messages: [{ role: "system", content: FRAGMENT_SYSTEM }, { role: "user", content: instructions }],
    schema,
    apply,
  };
}

function shortestExpandable(fields) {
  const sections = [];
  const steps = [];
  for (const key of ["sectionsBefore", "sectionsAfter"]) {
    for (const [index, section] of (fields[key] ?? []).entries()) {
      sections.push({ kind: "section", key, index, path: `${key}[${index}]`, title: section.title ?? "", words: words((section.paragraphs ?? []).join(" ")), paragraphs: section.paragraphs ?? [] });
    }
  }
  for (const [index, item] of (fields.steps?.items ?? []).entries()) {
    steps.push({ kind: "step", index, path: `steps.items[${index}].text`, title: item.title ?? "", words: words(item.text ?? ""), text: item.text ?? "" });
  }
  sections.sort((a, b) => a.words - b.words);
  steps.sort((a, b) => a.words - b.words);
  if (sections[0] && sections[0].words < SZ_BODY_PLAN.sectionsBefore.wordsEach[0]) return sections[0];
  return steps[0] ?? sections[0] ?? null;
}

/** One failing fragment. Null when the only safe fix would be the whole article. */
export function buildSzFragment(brief, fields, failure) {
  const limits = SZ.limits;
  if (failure.code === "description-length") {
    const description = fields.description ?? "";
    return fragment("description-length:description", [
      `description сейчас ${[...description].length} символов. Нужно ровно ${limits.description[0]}–${limits.description[1]}.`,
      `Запрос «${brief.query}» должен входить в текст. Не присылай статью целиком.`,
      "",
      description,
    ].join("\n"), objectSchema({ description: stringSchema }), (current, answer) => {
      const text = answer?.description;
      if (typeof text !== "string" || fieldProseDefect(text, "description")) return null;
      const length = [...text].length;
      if (length < limits.description[0] || length > limits.description[1]) return null;
      if (!normalize(text).includes(normalize(brief.query))) return null;
      return { ...current, description: text };
    });
  }
  if (failure.code === "seoTitle-length" || failure.code === "seoTitle-query") {
    const seoTitle = fields.seoTitle ?? "";
    return fragment("seoTitle:seoTitle", [
      `seoTitle сейчас ${[...seoTitle].length} символов. Нужно не больше ${limits.seoTitleMax}, начинается с запроса «${brief.query}», не совпадает с H1 «${brief.title}».`,
      "",
      seoTitle,
    ].join("\n"), objectSchema({ seoTitle: stringSchema }), (current, answer) => {
      const text = answer?.seoTitle;
      if (typeof text !== "string" || fieldProseDefect(text, "seoTitle")) return null;
      if ([...text].length > limits.seoTitleMax || text === brief.title) return null;
      if (!normalize(text).startsWith(normalize(brief.query))) return null;
      return { ...current, seoTitle: text };
    });
  }
  if (failure.code === "faq-length") {
    const index = Number(failure.path?.match(/faq\[(\d+)\]/)?.[1]);
    const item = fields.faq?.[index];
    if (!item) return null;
    return fragment(`faq-length:faq[${index}].answer`, [
      `Ответ FAQ сейчас ${words(item.answer)} слов. Нужно ${limits.faqAnswer[0]}–${limits.faqAnswer[1]} (ориентир 45–70).`,
      `Вопрос не меняй: «${item.question}».`,
      "Верни JSON { answer } – только этот ответ.",
      "",
      item.answer,
    ].join("\n"), objectSchema({ answer: stringSchema }), (current, answer) => {
      const text = answer?.answer;
      if (typeof text !== "string" || fieldProseDefect(text, "faq.answer")) return null;
      const count = words(text);
      if (count < limits.faqAnswer[0] || count > limits.faqAnswer[1]) return null;
      const faq = current.faq.map((entry, entryIndex) => (entryIndex === index ? { ...entry, answer: text } : entry));
      return { ...current, faq };
    });
  }
  if (failure.code === "unique-pack" && failure.path?.includes("faq[")) {
    const index = Number(failure.path.match(/faq\[(\d+)\]/)?.[1]);
    const item = fields.faq?.[index];
    if (!item) return null;
    return fragment(`unique-pack:faq[${index}].question`, [
      `Вопрос FAQ повторяется: «${item.question}».`,
      "Придумай другой вопрос по той же теме, не копируя формулировку. Ответ не меняй.",
      "Верни JSON { question }.",
    ].join("\n"), objectSchema({ question: stringSchema }), (current, answer) => {
      const text = answer?.question;
      if (typeof text !== "string" || fieldProseDefect(text, "faq.question")) return null;
      if (normalize(text) === normalize(item.question)) return null;
      const faq = current.faq.map((entry, entryIndex) => (entryIndex === index ? { ...entry, question: text } : entry));
      return { ...current, faq };
    });
  }
  if (failure.code === "body-length" && (failure.actual ?? 0) < (failure.min ?? limits.mainBody[0])) {
    const target = shortestExpandable(fields);
    if (!target) return null;
    const need = Math.min(160, Math.max(40, SZ_BODY_PLAN.target[0] - failure.actual));
    if (target.kind === "step") {
      return fragment(`body-length:${target.path}`, [
        `Шаг «${target.title}» сейчас ${target.words} слов. Основная часть статьи ${failure.actual} слов, нужно минимум ${failure.min}, цель ${SZ_BODY_PLAN.target[0]}.`,
        `Допиши этот шаг примерно на ${need} слов. Не повторяй уже сказанное и не добавляй ссылки.`,
        "Верни JSON { text } – полный новый текст шага.",
        "",
        target.text,
      ].join("\n"), objectSchema({ text: stringSchema }), (current, answer) => {
        const text = answer?.text;
        if (typeof text !== "string" || fieldProseDefect(text, "steps.text") || words(text) <= target.words) return null;
        const steps = structuredClone(current.steps);
        steps.items[target.index] = { ...steps.items[target.index], text };
        return { ...current, steps };
      });
    }
    return fragment(`body-length:${target.path}`, [
      `Раздел «${target.title}» сейчас ${target.words} слов. Основная часть статьи ${failure.actual} слов, нужно минимум ${failure.min}, цель ${SZ_BODY_PLAN.target[0]}.`,
      `Добавь 1–2 новых абзаца примерно на ${need} слов. Не повторяй уже сказанное и не добавляй ссылки.`,
      "Верни JSON { paragraphs } – только новые абзацы.",
      "",
      ...target.paragraphs,
    ].join("\n"), objectSchema({ paragraphs: { type: "array", maxItems: 2, items: stringSchema } }), (current, answer) => {
      const paragraphs = answer?.paragraphs;
      if (!Array.isArray(paragraphs) || !paragraphs.length || paragraphs.length > 2) return null;
      if (paragraphs.some((paragraph) => typeof paragraph !== "string" || fieldProseDefect(paragraph, "paragraph"))) return null;
      const sections = structuredClone(current[target.key]);
      sections[target.index] = { ...sections[target.index], paragraphs: [...sections[target.index].paragraphs, ...paragraphs] };
      return { ...current, [target.key]: sections };
    });
  }
  if (failure.code === "summoning" || failure.code === "forbidden" || failure.code === "mixed-script") {
    const banned = failure.message.match(/«([^»]+)»/)?.[1] ?? "";
    const pattern = failure.code === "mixed-script"
      ? /[A-Za-zА-Яа-яЁё]*[A-Za-z][А-Яа-яЁё]|[A-Za-zА-Яа-яЁё]*[А-Яа-яЁё][A-Za-z]/u
      : (failure.code === "summoning" ? SUMMONING : new RegExp(banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
    const found = findString(fields, pattern);
    if (!found?.path) return null;
    return fragment(`${failure.code}:${found.path}`, [
      `В этом фрагменте ошибка «${failure.code}»: ${failure.message}`,
      "Перепиши только его, убери причину ошибки, сохрани смысл. Без оберегов, защиты и внешних ссылок.",
      "Верни JSON { text }.",
      "",
      found.text,
    ].join("\n"), objectSchema({ text: stringSchema }), (current, answer) => {
      const text = answer?.text;
      if (typeof text !== "string" || fieldProseDefect(text, found.path)) return null;
      if (failure.code === "forbidden" ? normalize(text).includes(normalize(banned)) : pattern.test(text)) return null;
      return setPath(current, found.path, text);
    });
  }
  return null;
}

const PRIORITY = ["mixed-script", "em-dash", "description-length", "seoTitle-length", "seoTitle-query", "faq-length", "body-length", "body-sections", "summoning", "forbidden", "unique-pack"];

function failureKey(failure) {
  return `${failure.code}:${failure.path ?? failure.field}`;
}

function pickFailure(failures, cheapTries, strongTries, cheapLimit) {
  const rank = (code) => {
    const index = PRIORITY.indexOf(code);
    return index < 0 ? PRIORITY.length : index;
  };
  const ranked = [...failures].sort((a, b) => rank(a.code) - rank(b.code) || String(a.path).localeCompare(String(b.path)));
  return ranked.find((failure) => {
    const key = failureKey(failure);
    const cheap = cheapTries.get(key) ?? 0;
    const strong = strongTries.get(key) ?? 0;
    return cheap < cheapLimit || strong < 1;
  }) ?? null;
}

function tierSpent(attempts, tier) {
  return attempts.filter((attempt) => attempt.tier === tier).reduce((sum, attempt) => sum + attempt.costRub, 0);
}

/**
 * Repair until checkSzArticle is clean, or until every fragment has used its cheap
 * tries and one strong try. callTier(tier, name, messages, schema) performs the model call.
 */
export function repairSzArticleTiered({ brief, raw, build, repair, callTier, state = { spentRub: 0, calls: [], warnings: [] }, args = {} }) {
  const errorsOf = (result) => result.problems.filter((problem) => problem.severity === "error");
  let result = build(raw);
  const errorsBeforeRepair = errorsOf(result);
  const deterministic = applyDeterministicSzFixes(raw, { query: brief.query });
  let fields = deterministic.fields;
  if (deterministic.fixes.length) result = build(fields);
  const attempts = [];
  const cheapTries = new Map();
  const strongTries = new Map();
  const allowModel = !args.offline && !args["no-repair"];
  const maxRounds = repair.maxRounds ?? 12;
  for (let round = 0; round < maxRounds && allowModel && errorsOf(result).length; round += 1) {
    const { failures } = szQuantityReport(fields, errorsOf(result));
    const failure = pickFailure(failures, cheapTries, strongTries, repair.cheapTries);
    if (!failure) break;
    const key = failureKey(failure);
    const fragmentJob = buildSzFragment(brief, fields, failure);
    if (!fragmentJob) {
      cheapTries.set(key, repair.cheapTries);
      strongTries.set(key, 1);
      continue;
    }
    const tier = (cheapTries.get(key) ?? 0) >= repair.cheapTries ? "strong" : "cheap";
    const model = tier === "strong" ? repair.strongModel : repair.cheapModel;
    const maxTokens = tier === "strong" ? repair.strongMaxTokens : repair.cheapMaxTokens;
    const budget = tier === "strong" ? repair.strongBudget : repair.cheapBudget;
    const worst = worstCaseRub(model, estimatePromptTokens(fragmentJob.messages, model), maxTokens);
    if (tierSpent(attempts, tier) + worst > budget) {
      state.warnings.push(`${brief.slug}: ярус ${tier} остановлен бюджетом ${budget} ₽`);
      if (tier === "cheap") {
        cheapTries.set(key, repair.cheapTries);
        continue;
      }
      break;
    }
    const before = state.spentRub ?? 0;
    let answer = null;
    try {
      answer = callTier(tier, `${brief.slug}-repair-${tier}-${fragmentJob.key.replace(/[^a-z0-9[\].-]+/gi, "-")}`, fragmentJob.messages, fragmentJob.schema);
    } catch (error) {
      if (!(error instanceof BudgetError) && error?.code !== 5) throw error;
      state.warnings.push(`${brief.slug}: ярус ${tier} остановлен общим бюджетом`);
      if (tier === "cheap") {
        cheapTries.set(key, repair.cheapTries);
        continue;
      }
      break;
    }
    const costRub = (state.spentRub ?? 0) - before;
    const merged = fragmentJob.apply(fields, answer);
    if (merged) {
      fields = merged;
      result = build(fields);
    }
    if (tier === "cheap") cheapTries.set(key, (cheapTries.get(key) ?? 0) + 1);
    else strongTries.set(key, (strongTries.get(key) ?? 0) + 1);
    attempts.push({ tier, key: fragmentJob.key, model, costRub, applied: Boolean(merged) });
  }
  const errors = errorsOf(result);
  return {
    result,
    errors,
    errorsBeforeRepair,
    repairSkipped: errors.length ? errors.map((error) => `${error.field}: ${error.message}`).join("; ") : null,
    passed: errors.length === 0,
    deterministic: deterministic.fixes,
    attempts,
  };
}

export function repairSzPackDuplicates({ items, repair, callTier, state, args = {} }) {
  if (args.offline || args["no-repair"]) return;
  const seen = new Set();
  for (const item of items) {
    const problems = item.packProblems ?? [];
    for (const problem of problems) {
      if (problem.code !== "unique-pack" || problem.field !== "faq" || problem.slug !== item.brief.slug) continue;
      const question = problem.message.match(/«([^»]+)»/)?.[1];
      const index = item.fields.faq.findIndex((entry) => entry.question === question);
      if (index < 0) continue;
      const key = `${item.brief.slug}:${index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const failure = { code: "unique-pack", field: "faq", path: `faq[${index}].question`, message: problem.message };
      const job = buildSzFragment(item.brief, item.fields, failure);
      if (!job) continue;
      const worst = worstCaseRub(repair.cheapModel, estimatePromptTokens(job.messages, repair.cheapModel), repair.cheapMaxTokens);
      if (worst > repair.cheapBudget) continue;
      const before = state.spentRub ?? 0;
      let answer = null;
      try {
        answer = callTier("cheap", `${item.brief.slug}-repair-cheap-faq-${index}`, job.messages, job.schema);
      } catch (error) {
        if (!(error instanceof BudgetError) && error?.code !== 5) throw error;
        continue;
      }
      const merged = job.apply(item.fields, answer);
      item.attempts = [...(item.attempts ?? []), { tier: "cheap", key: job.key, costRub: (state.spentRub ?? 0) - before, applied: Boolean(merged) }];
      if (!merged) continue;
      item.fields = merged;
      const rebuilt = item.build(merged);
      item.md = rebuilt.md;
      item.fields = rebuilt.fields;
    }
  }
}

