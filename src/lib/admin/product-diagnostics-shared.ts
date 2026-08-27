import type { AuthorSubmitEligibility } from "@/lib/admin/author-submit-eligibility";
import type { DatabaseModerationReadyResult } from "@/lib/author-products/database-moderation-ready";
import type { PublishReadinessResult } from "@/lib/author-products/publish";

export type AdminProductLayeredIssue = {
  layer: "client" | "server" | "database";
  code: string;
  message: string;
};

export function collectLayeredDiagnosticIssues(input: {
  submitEligibility: AuthorSubmitEligibility;
  tsReadiness: PublishReadinessResult;
  dbReadiness: DatabaseModerationReadyResult;
}): AdminProductLayeredIssue[] {
  const issues: AdminProductLayeredIssue[] = [];

  if (
    input.submitEligibility.action === "hidden" ||
    input.submitEligibility.action === "disabled" ||
    !input.submitEligibility.enabled
  ) {
    issues.push({
      layer: "client",
      code: `ui_${input.submitEligibility.action}`,
      message: input.submitEligibility.reason,
    });
  }

  if (input.submitEligibility.commercialBlock) {
    issues.push({
      layer: "client",
      code: input.submitEligibility.commercialBlock.code,
      message: input.submitEligibility.commercialBlock.message,
    });
  }

  for (const requirement of input.tsReadiness.requirements) {
    if (!requirement.ok && requirement.code && requirement.message) {
      issues.push({
        layer: "server",
        code: requirement.code,
        message: requirement.message,
      });
    }
  }

  for (const check of input.dbReadiness.checks) {
    if (!check.ok && check.message) {
      const alreadyOnServer = issues.some(
        (issue) => issue.layer === "server" && issue.code === check.code,
      );
      if (alreadyOnServer) {
        continue;
      }
      issues.push({
        layer: "database",
        code: check.code,
        message: check.message,
      });
    }
  }

  return issues;
}
