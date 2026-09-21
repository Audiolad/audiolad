import type {
  ProductQualityReviewIssue,
  ProductQualityReviewResult,
  ProductQualityReviewSignals,
} from "@/lib/seo/product-quality-review/types";
import { PRODUCT_QUALITY_REVIEW_ISSUES_MAX } from "@/lib/seo/product-quality-review/types";
import { humanizeProductQualityReviewText } from "@/lib/seo/product-quality-review/ui";

export const DESCRIPTION_STUFFING_ISSUE_MESSAGE =
  "Основное описание продукта перегружено повторяющимися поисковыми формулировками.";

export const DESCRIPTION_STUFFING_ISSUE_RECOMMENDATION =
  "Сократите повторения основного и близких поисковых запросов. Оставьте их только там, где они звучат естественно для читателя.";

const ADD_MORE_KEYS_RE =
  /добавьте\s+(ещё\s+)?(основной\s+|дополнительн\w*\s+)?(поисков\w*\s+)?(запрос|ключ|фраз)/i;

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
