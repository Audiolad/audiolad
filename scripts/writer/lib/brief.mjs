// Brief loading and validation. The brief is the only editorial input of a run.
import { readJson } from "./util.mjs";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function range(value, fallback, name, errors) {
  const result = { ...fallback, ...(value ?? {}) };
  if (!Number.isInteger(result.min) || !Number.isInteger(result.max) || result.min > result.max) {
    errors.push(`${name}: ожидается {min, max} с целыми min ≤ max`);
  }
  return result;
}

function practice(value, name, errors) {
  if (!value || typeof value !== "object") {
    errors.push(`${name}: обязательный объект`);
    return null;
  }
  for (const field of ["key", "authorPath", "title", "description"]) {
    if (typeof value[field] !== "string" || !value[field].trim()) {
      errors.push(`${name}.${field}: обязательная строка`);
    }
  }
  if (value.key && !KEY_RE.test(value.key)) errors.push(`${name}.key: недопустимый ключ`);
  if (value.authorPath && !SLUG_RE.test(value.authorPath)) {
    errors.push(`${name}.authorPath: недопустимый путь автора`);
  }
  return {
    key: value.key,
    authorPath: value.authorPath,
    title: value.title,
    description: value.description,
    href: `/practice/${value.authorPath}/${value.key}`,
  };
}

export function loadBrief(path) {
  return normalizeBrief(readJson(path));
}

export function normalizeBrief(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") throw new Error("Бриф должен быть JSON-объектом");

  // AGENTS.md: каждая SEO-статья объявляет ровно один тип. Пайплайн поддерживает только practice.
  if (raw.articleType !== "practice") {
    errors.push('articleType: поддерживается только "practice" (ARTICLE TYPE: practice)');
  }
  if (typeof raw.slug !== "string" || !SLUG_RE.test(raw.slug) || raw.slug.length > 80) {
    errors.push("slug: латиница, цифры и дефисы, до 80 символов");
  }
  for (const field of ["topic", "primaryKeyword", "intent", "cluster"]) {
    if (typeof raw[field] !== "string" || !raw[field].trim()) errors.push(`${field}: обязательная строка`);
  }
  const primaryPractice = practice(raw.primaryPractice, "primaryPractice", errors);
  const relatedPractices = (raw.relatedPractices ?? []).map((item, index) =>
    practice(item, `relatedPractices[${index}]`, errors),
  );
  if (relatedPractices.length > 3) errors.push("relatedPractices: не больше 3");
  const practiceKeys = [primaryPractice, ...relatedPractices].filter(Boolean).map((item) => item.key);
  if (new Set(practiceKeys).size !== practiceKeys.length) errors.push("практики не должны повторяться");

  const internalLinks = (raw.internalLinks ?? []).map((item, index) => {
    if (!item || typeof item.href !== "string" || !item.href.startsWith("/")) {
      errors.push(`internalLinks[${index}].href: относительный путь, начинается с /`);
    }
    return { href: item?.href, note: item?.note ?? "" };
  });

  const sources = (raw.sources ?? []).map((item, index) => {
    if (!item || typeof item.id !== "string" || typeof item.text !== "string" || !item.text.trim()) {
      errors.push(`sources[${index}]: нужны id и text (проверенный дословный текст)`);
    }
    if (item?.url && !/^https:\/\//.test(item.url)) errors.push(`sources[${index}].url: только https`);
    return { id: item?.id, title: item?.title ?? "", url: item?.url ?? null, text: item?.text ?? "" };
  });
  const sourceIds = new Set(sources.map((item) => item.id));
  if (sourceIds.size !== sources.length) errors.push("sources: id должны быть уникальны");
  const requiredQuotes = raw.requiredQuotes ?? [];
  for (const id of requiredQuotes) {
    if (!sourceIds.has(id)) errors.push(`requiredQuotes: нет источника ${id}`);
  }

  const externalLinks = [
    ...new Set([...(raw.externalLinks ?? []), ...sources.map((item) => item.url).filter(Boolean)]),
  ];
  for (const url of externalLinks) {
    if (!/^https:\/\/[^\s]+$/.test(url)) errors.push(`externalLinks: недопустимый URL ${url}`);
  }

  const tableMode = raw.table?.mode ?? "optional";
  if (!["required", "optional", "forbidden"].includes(tableMode)) {
    errors.push("table.mode: required | optional | forbidden");
  }

  const brief = {
    articleType: "practice",
    slug: raw.slug,
    topic: raw.topic,
    primaryKeyword: raw.primaryKeyword,
    keywordFrequency: Number.isInteger(raw.keywordFrequency) ? raw.keywordFrequency : null,
    secondaryKeywords: raw.secondaryKeywords ?? [],
    cluster: raw.cluster,
    intent: raw.intent,
    audience: raw.audience ?? "",
    primaryPractice,
    relatedPractices,
    internalLinks,
    minInternalArticleLinks: raw.minInternalArticleLinks ?? 2,
    seeAlso: range(raw.seeAlso, { min: 2, max: 3 }, "seeAlso", errors),
    sources,
    requiredQuotes,
    facts: raw.facts ?? [],
    forbiddenPhrases: raw.forbiddenPhrases ?? [],
    externalLinks,
    wordCount: range(raw.wordCount, { min: 900, max: 1500 }, "wordCount", errors),
    sections: range(raw.sections, { min: 4, max: 7 }, "sections", errors),
    faq: range(raw.faq, { min: 3, max: 5 }, "faq", errors),
    table: {
      mode: tableMode,
      columns: raw.table?.columns ?? null,
      rows: range(raw.table?.rows, { min: 3, max: 6 }, "table.rows", errors),
      note: raw.table?.note ?? "",
    },
    extraInstructions: raw.extraInstructions ?? [],
    publishedAt: raw.publishedAt ?? null,
    pilot: raw.pilot === true,
  };
  if (errors.length) {
    throw new Error(`Бриф не прошёл проверку:\n- ${errors.join("\n- ")}`);
  }
  return brief;
}
