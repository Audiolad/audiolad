import type {
  ProductQualityReviewField,
  ProductQualityReviewIssue,
  ProductQualityReviewPrimaryPresence,
  ProductQualityReviewResult,
  ProductQualityReviewSignals,
} from "@/lib/seo/product-quality-review/types";
import { PRODUCT_QUALITY_REVIEW_ISSUES_MAX } from "@/lib/seo/product-quality-review/types";
import { humanizeProductQualityReviewText } from "@/lib/seo/product-quality-review/ui";

export const DESCRIPTION_STUFFING_ISSUE_MESSAGE =
  "Основное описание продукта перегружено повторяющимися поисковыми формулировками.";

export const DESCRIPTION_STUFFING_ISSUE_RECOMMENDATION =
  "Сократите повторения основного и близких поисковых запросов. Оставьте их только там, где они звучат естественно для читателя.";

export const NATURAL_THEME_COVERED_SUMMARY =
  "Поисковая тема естественно выражена в описании продукта и в полях для поиска.";

const ADD_MORE_KEYS_RE =
  /добавьте\s+(?:ещё\s+)?(?:основн\p{L}*\s+|дополнительн\p{L}*\s+)?(?:поисков\p{L}*\s+)?(?:запрос|ключ|фраз)/iu;

/**
 * Advice that the primary query is missing or should be inserted.
 * `\p{L}` because `\w` does not match Russian letters.
 * Secondary-only advice is excluded by the caller.
 */
const PRIMARY_GAP_RE =
  /(основн\p{L}*\s+(?:поисков\p{L}*\s+)?запрос)|(?:добавьте\s+его)|(?:только\s+в\s+(?:названи|заголовк)\p{L}*)|(?:точн\p{L}*\s+фраз)|(?:не\s+хватает\s+основн)|(?:нет\s+основн)/iu;

const CORE_THEME_FIELDS = [
  "description",
  "seoTitle",
  "seoDescription",
] as const satisfies readonly (keyof ProductQualityReviewPrimaryPresence)[];

type CoreThemeField = (typeof CORE_THEME_FIELDS)[number];

const FIELD_MENTIONS: Array<[ProductQualityReviewField, RegExp]> = [
  ["seoDescription", /описани\p{L}*\s+для\s+поиска/iu],
  ["seoTitle", /заголов\p{L}*\s+для\s+поиска/iu],
  ["description", /описани\p{L}*\s+продукта|основн\p{L}*\s+описани/iu],
  ["usage", /когда слушать/iu],
  ["faq", /вопросы и ответы/iu],
];

function issueText(issue: ProductQualityReviewIssue): string {
  return `${issue.message}\n${issue.recommendation}`;
}

function isAboutPrimaryGap(issue: ProductQualityReviewIssue): boolean {
  const text = issueText(issue);
  if (/дополнительн/i.test(text) && !/основн/i.test(text)) return false;
  return PRIMARY_GAP_RE.test(text);
}

function referencedFields(
  issue: ProductQualityReviewIssue,
): ProductQualityReviewField[] {
  const fields: ProductQualityReviewField[] = [issue.field];
  const text = issueText(issue);
  for (const [field, pattern] of FIELD_MENTIONS) {
    if (!fields.includes(field) && pattern.test(text)) fields.push(field);
  }
  return fields;
}

function coreFields(fields: readonly ProductQualityReviewField[]): CoreThemeField[] {
  return fields.filter((field): field is CoreThemeField =>
    (CORE_THEME_FIELDS as readonly string[]).includes(field),
  );
}

function themeCoveredInDescriptionAndSearch(
  signals: ProductQualityReviewSignals,
): boolean {
  const theme = signals.primaryThemePresentIn;
  return (
    theme.description &&
    (theme.seoDescription || theme.seoTitle) &&
    !signals.structuralStuffing.material
  );
}

/** Model asks to add the primary into a field that already carries the theme. */
function isContradictoryPresentFieldIssue(
  issue: ProductQualityReviewIssue,
  signals: ProductQualityReviewSignals,
): boolean {
  if (!isAboutPrimaryGap(issue)) return false;
  const core = coreFields(referencedFields(issue));
  if (core.length === 0) return false;
  return core.every((field) => signals.primaryThemePresentIn[field]);
}

/**
 * Literal exact phrase missing only in «Когда слушать» / «Вопросы и ответы»
 * does not force yellow when description and search metadata already carry the theme.
 */
function isNonForcingUsageFaqGap(
  issue: ProductQualityReviewIssue,
  signals: ProductQualityReviewSignals,
): boolean {
  if (!themeCoveredInDescriptionAndSearch(signals)) return false;
  if (!isAboutPrimaryGap(issue)) return false;
  const fields = referencedFields(issue);
  if (coreFields(fields).length > 0) return false;
  return fields.some((field) => field === "usage" || field === "faq");
}

function isAddMoreKeysAdvice(issue: ProductQualityReviewIssue): boolean {
  return (
    ADD_MORE_KEYS_RE.test(issue.recommendation) ||
    ADD_MORE_KEYS_RE.test(issue.message)
  );
}

function hasDescriptionStuffingIssue(issues: ProductQualityReviewIssue[]): boolean {
  return issues.some(
    (issue) =>
      issue.field === "description" &&
      (/перегружен|переспам|повтор|набор поисков|ключев/i.test(issue.message) ||
        issue.message === DESCRIPTION_STUFFING_ISSUE_MESSAGE),
  );
}

function humanizeIssue(issue: ProductQualityReviewIssue): ProductQualityReviewIssue {
  return {
    ...issue,
    message: humanizeProductQualityReviewText(issue.message),
    recommendation: humanizeProductQualityReviewText(issue.recommendation),
  };
}

function stripAddMoreKeysAdvice(
  issues: ProductQualityReviewIssue[],
): ProductQualityReviewIssue[] {
  return issues.filter((issue) => !isAddMoreKeysAdvice(issue));
}

/**
 * Server-side reconciliation after the model result.
 * Material structural stuffing always wins over coverage / model GREEN|YELLOW.
 */
export function reconcileProductQualityReviewResult(
  model: ProductQualityReviewResult,
  signals: ProductQualityReviewSignals,
): ProductQualityReviewResult {
  let status = model.status;
  let summary = humanizeProductQualityReviewText(model.summary);
  let issues = model.issues.map(humanizeIssue);
  let positiveNotes = model.positiveNotes.map(humanizeProductQualityReviewText);

  const stuffing = signals.structuralStuffing;

  if (stuffing.material) {
    status = "red";
    summary = humanizeProductQualityReviewText(
      "Текст переоптимизирован: в важных блоках слишком много повторяющихся поисковых формулировок.",
    );
    issues = stripAddMoreKeysAdvice(issues);

    if (stuffing.description.material && !hasDescriptionStuffingIssue(issues)) {
      const descriptionIssue: ProductQualityReviewIssue = {
        severity: "critical",
        field: "description",
        message: DESCRIPTION_STUFFING_ISSUE_MESSAGE,
        recommendation: DESCRIPTION_STUFFING_ISSUE_RECOMMENDATION,
      };
      issues = [descriptionIssue, ...issues].slice(
        0,
        PRODUCT_QUALITY_REVIEW_ISSUES_MAX,
      );
    }

    // Prefer reduce-spam advice first; drop contradictory "add more" positives.
    positiveNotes = positiveNotes.filter(
      (note) => !ADD_MORE_KEYS_RE.test(note) && !/добавьте/i.test(note),
    );
  } else {
    issues = issues.filter(
      (issue) => !isContradictoryPresentFieldIssue(issue, signals),
    );
    if (themeCoveredInDescriptionAndSearch(signals)) {
      issues = issues.filter((issue) => !isNonForcingUsageFaqGap(issue, signals));
    }
    // Do not promote GREEN from exactPrimaryCount or any occurrence quota.
    // Yellow is cleared only when description and search metadata already
    // carry the theme and every remaining issue contradicted that coverage.
    if (
      status === "yellow" &&
      themeCoveredInDescriptionAndSearch(signals) &&
      issues.length === 0
    ) {
      status = "green";
      summary = NATURAL_THEME_COVERED_SUMMARY;
    }
  }

  // Ensure field labels stay human in any leftover technical tokens.
  issues = issues.map(humanizeIssue);
  summary = humanizeProductQualityReviewText(summary);
  positiveNotes = positiveNotes.map(humanizeProductQualityReviewText);

  return {
    status,
    summary,
    issues,
    positiveNotes,
  };
}
