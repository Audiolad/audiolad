// Machine-readable quantitative failures. The gate stays in rules.mjs; this module
// turns those errors (and the field breakdown a fragment repair needs) into rows.
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

/** Hard stop for the control run: 12 ₽ on one article, 120 ₽ on the run. The first call of an article is allowed. */
export function szSpendAllowed({ spentRub = 0, articleSpentRub = 0, worst = 0, articleCap = 12, runCap = 120 } = {}) {
  if (spentRub >= runCap || spentRub + worst > runCap) return "run";
  if (articleSpentRub >= articleCap || (articleSpentRub > 0 && articleSpentRub + worst > articleCap)) return "article";
  return "ok";
}
