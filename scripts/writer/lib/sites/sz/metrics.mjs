// Machine-readable quantitative failures. The gate stays in rules.mjs; this module
// turns those errors (and the field breakdown a fragment repair needs) into rows.
import { TARIFF, costRub, worstCaseRub } from "../../cost.mjs";
import { SZ } from "./config.mjs";
import { words } from "./rules.mjs";

export function szH2Count(fields) {
  return (fields?.sectionsBefore?.length ?? 0) + (fields?.sectionsAfter?.length ?? 0) + 3;
}

export function szSectionBreakdown(fields) {
  const rows = [];
  for (const key of ["sectionsBefore", "sectionsAfter"]) {
    for (const [index, section] of (fields?.[key] ?? []).entries()) {
      rows.push({
        path: `${key}[${index}]`,
        title: section?.title ?? "",
        words: words([section?.title, ...(section?.paragraphs ?? [])].join("\n")),
      });
    }
  }
  const table = fields?.tableSection;
  if (table) {
    rows.push({
      path: "tableSection",
      title: table.title ?? "",
      words: words([table.title, ...(table.paragraphsBefore ?? []), ...(table.paragraphsAfter ?? [])].join("\n")),
    });
  }
  const steps = fields?.steps;
  if (steps) {
    rows.push({
      path: "steps",
      title: steps.title ?? "",
      words: words([steps.title, steps.intro, ...(steps.items ?? []).map((item) => `${item?.title ?? ""} ${item?.text ?? ""}`)].join("\n")),
    });
  }
  if (fields?.specialist) {
    rows.push({
      path: "specialist",
      title: SZ.specialistHeading,
      words: words([fields.specialist.intro, ...(fields.specialist.items ?? [])].join("\n")),
    });
  }
  return rows;
}

function quantityOf(message) {
  const h2 = message.match(/(\d+) H2, нужно (\d+)–(\d+)/);
  if (h2) return { actual: Number(h2[1]), min: Number(h2[2]), max: Number(h2[3]), unit: "h2" };
  const chars = message.match(/(\d+) символов, нужно (\d+)–(\d+)/);
  if (chars) return { actual: Number(chars[1]), min: Number(chars[2]), max: Number(chars[3]), unit: "chars" };
  const charsMax = message.match(/(\d+) символов, нужно ≤ (\d+)/);
  if (charsMax) return { actual: Number(charsMax[1]), min: null, max: Number(charsMax[2]), unit: "chars" };
  const counted = message.match(/(\d+) слов, нужно (\d+)–(\d+)/);
  if (counted) return { actual: Number(counted[1]), min: Number(counted[2]), max: Number(counted[3]), unit: "words" };
  const times = message.match(/(\d+) раз, нужно (\d+)–(\d+)/);
  if (times) return { actual: Number(times[1]), min: Number(times[2]), max: Number(times[3]), unit: "times" };
  const linkCount = message.match(/(\d+) ссылок \/s в тексте, нужно (\d+)–(\d+)/);
  if (linkCount) return { actual: Number(linkCount[1]), min: Number(linkCount[2]), max: Number(linkCount[3]), unit: "links" };
  return {};
}

/** Failures of one article, plus optional pack-level rows. Each row names a field. */
export function szQuantityReport(fields, problems = [], packProblems = []) {
  const sections = szSectionBreakdown(fields);
  const failures = [];
  for (const problem of [...problems, ...packProblems]) {
    if (problem.severity && problem.severity !== "error") continue;
    const message = String(problem.message ?? "");
    const row = { field: problem.field ?? "*", code: problem.code, path: problem.field ?? "*", message, ...quantityOf(message) };
    if (problem.code === "body-length") row.parts = sections;
    if (problem.code === "faq-length" || problem.code === "faq-fragment" || problem.code === "unique-pack" || (problem.code === "unique" && problem.field === "faq")) {
      const question = message.match(/«([^»]+)»/)?.[1];
      const index = (fields?.faq ?? []).findIndex((item) => item.question === question);
      if (index >= 0) row.path = problem.code === "unique-pack" || problem.code === "unique" ? `faq[${index}].question` : `faq[${index}].answer`;
    }
    if (problem.slug) row.slug = problem.slug;
    failures.push(row);
  }
  return { failures, sections, h2: szH2Count(fields) };
}

/** Accepted-article price is every charged ruble (failed drafts included) divided by the number that passed. */
export function szPackCost(articles = []) {
  const withCost = articles.filter((article) => typeof article.costRub === "number");
  const finished = withCost.filter((article) => article.passed);
  const finishedCostRub = finished.reduce((sum, article) => sum + article.costRub, 0);
  const spentRub = withCost.reduce((sum, article) => sum + article.costRub, 0);
  const costPerAccepted = finished.length ? spentRub / finished.length : null;
  return {
    finished: finished.length,
    total: withCost.length,
    finishedCostRub,
    spentRub,
    costPerFinished: costPerAccepted,
    costPerAccepted,
  };
}

/** Hard stop for the control run: 12 ₽ on one article, 120 ₽ on the run, including the first call. */
export function szSpendAllowed({ spentRub = 0, articleSpentRub = 0, worst = 0, articleCap = 12, runCap = 120 } = {}) {
  if (spentRub >= runCap || spentRub + worst > runCap) return "run";
  if (articleSpentRub >= articleCap || articleSpentRub + worst > articleCap) return "article";
  return "ok";
}

/**
 * Largest completion budget whose worst case still fits in `roomRub`.
 * 0 means even one output token (or the prompt alone) does not fit.
 */
export function affordableMaxTokens(model, promptTokens, requested, roomRub) {
  const requestedTokens = Math.max(0, Math.floor(Number(requested) || 0));
  if (!(roomRub > 0) || requestedTokens < 1 || !TARIFF[model]) return 0;
  const inputCost = costRub(model, promptTokens, 0);
  if (inputCost > roomRub) return 0;
  let tokens = Math.min(requestedTokens, Math.floor(((roomRub - inputCost) * 1e6) / TARIFF[model].outputPer1M));
  while (tokens > 0 && worstCaseRub(model, promptTokens, tokens) > roomRub) tokens -= 1;
  return tokens;
}

/**
 * Output tokens left for the draft after the prompt, once the 12 ₽ article cap is applied.
 * Russian JSON in the control drafts was about 3.1 tokens per word.
 */
export function szDraftTokenBudget({ model, promptTokens = 0, requestedTokens = 9000, articleCap = SZ.articleRubCap, runCap = SZ.runRubCap, tokensPerWord = 3.1 } = {}) {
  const fit = szCallFit({ model, promptTokens, requestedTokens, articleCap, runCap });
  const inputRub = costRub(model, promptTokens, 0);
  return {
    ...fit,
    inputRub,
    outputRub: costRub(model, 0, fit.maxTokens),
    wordsAtBudget: Math.floor(fit.maxTokens / tokensPerWord),
    tokensPerWord,
  };
}

/** Cap one call, including the first, so its worst case fits the remaining article and run budgets. */
export function szCallFit({ model, promptTokens = 0, requestedTokens = 0, spentRub = 0, articleSpentRub = 0, articleCap = 12, runCap = 120 } = {}) {
  const room = Math.min(articleCap - articleSpentRub, runCap - spentRub);
  const maxTokens = affordableMaxTokens(model, promptTokens, requestedTokens, room);
  if (maxTokens >= 1) return { maxTokens, worst: worstCaseRub(model, promptTokens, maxTokens), decision: "ok" };
  const worst = worstCaseRub(model, promptTokens, Math.max(1, Math.floor(Number(requestedTokens) || 1)));
  const decision = szSpendAllowed({ spentRub, articleSpentRub, worst, articleCap, runCap });
  return { maxTokens: 0, worst, decision: decision === "ok" ? "article" : decision };
}
