import {
  PRODUCT_QUALITY_REVIEW_FIELDS,
  PRODUCT_QUALITY_REVIEW_ISSUE_SEVERITIES,
  PRODUCT_QUALITY_REVIEW_ISSUES_MAX,
  PRODUCT_QUALITY_REVIEW_POSITIVE_NOTES_MAX,
  PRODUCT_QUALITY_REVIEW_STATUSES,
  type ProductQualityReviewField,
  type ProductQualityReviewIssue,
  type ProductQualityReviewIssueSeverity,
  type ProductQualityReviewPackage,
  type ProductQualityReviewRequest,
  type ProductQualityReviewResult,
  type ProductQualityReviewStatus,
} from "@/lib/seo/product-quality-review/types";

function readString(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function readStringArray(value: unknown, maxItems: number, maxLen = 200): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, maxLen));
    if (out.length >= maxItems) break;
  }
  return out;
}

export function parseProductQualityReviewRequest(
  body: unknown,
):
  | { ok: true; request: ProductQualityReviewRequest }
  | { ok: false; code: "invalid_request" | "missing_primary" | "beta_required" } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "invalid_request" };
  }
  const raw = body as Record<string, unknown>;
  const authorId = readString(raw.authorId, 80);
  if (!authorId) return { ok: false, code: "invalid_request" };

  const seoPrimaryQuery = readString(raw.seoPrimaryQuery, 200);
  if (!seoPrimaryQuery) return { ok: false, code: "missing_primary" };

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const subtitle = typeof raw.subtitle === "string" ? raw.subtitle.trim() : "";
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";
  const productKind =
    typeof raw.productKind === "string" ? raw.productKind.trim() : "";
  const publicationClass =
    typeof raw.publicationClass === "string"
      ? raw.publicationClass.trim()
      : "";
  const seoTitle = typeof raw.seoTitle === "string" ? raw.seoTitle.trim() : "";
  const seoDescription =
    typeof raw.seoDescription === "string" ? raw.seoDescription.trim() : "";

  const seoSecondaryQueries = readStringArray(raw.seoSecondaryQueries, 20, 120);
  const usageItems = readStringArray(raw.usageItems, 12, 400);

  const faqItems: ProductQualityReviewPackage["faqItems"] = [];
  if (Array.isArray(raw.faqItems)) {
    for (const item of raw.faqItems) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const question =
        typeof row.question === "string" ? row.question.trim() : "";
      const answer = typeof row.answer === "string" ? row.answer.trim() : "";
      if (!question && !answer) continue;
      faqItems.push({ question, answer });
      if (faqItems.length >= 12) break;
    }
  }

  return {
    ok: true,
    request: {
      authorId,
      title,
      subtitle,
      description,
      productKind,
      publicationClass,
      seoPrimaryQuery,
      seoSecondaryQueries,
      seoTitle,
      seoDescription,
      usageItems,
      faqItems,
    },
  };
}

export function parseProductQualityReviewResult(
  value: unknown,
): ProductQualityReviewResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.status !== "string" ||
    !PRODUCT_QUALITY_REVIEW_STATUSES.includes(
      raw.status as ProductQualityReviewStatus,
    )
  ) {
    return null;
  }
  const summary = readString(raw.summary, 500);
  if (!summary) return null;

  const issues: ProductQualityReviewIssue[] = [];
  if (Array.isArray(raw.issues)) {
    for (const item of raw.issues) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      if (
        typeof row.severity !== "string" ||
        !PRODUCT_QUALITY_REVIEW_ISSUE_SEVERITIES.includes(
          row.severity as ProductQualityReviewIssueSeverity,
        )
      ) {
        continue;
      }
      if (
        typeof row.field !== "string" ||
        !PRODUCT_QUALITY_REVIEW_FIELDS.includes(
          row.field as ProductQualityReviewField,
        )
      ) {
        continue;
      }
      const message = readString(row.message, 400);
      const recommendation = readString(row.recommendation, 400);
      if (!message || !recommendation) continue;
      issues.push({
        severity: row.severity as ProductQualityReviewIssueSeverity,
        field: row.field as ProductQualityReviewField,
        message,
        recommendation,
      });
      if (issues.length >= PRODUCT_QUALITY_REVIEW_ISSUES_MAX) break;
    }
  }

  const positiveNotes = readStringArray(
    raw.positiveNotes,
    PRODUCT_QUALITY_REVIEW_POSITIVE_NOTES_MAX,
    240,
  );

  // Reject pseudo-scores if the model sneaks them into summary.
  if (/\b\d{1,3}\s*\/\s*100\b/.test(summary) || /seo score/i.test(summary)) {
    return null;
  }

  return {
    status: raw.status as ProductQualityReviewStatus,
    summary,
    issues,
    positiveNotes,
  };
}
