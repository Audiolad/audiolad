import type { AuthorSubmitEligibility } from "@/lib/admin/author-submit-eligibility";
import { VISIBLE_AUTHOR_PRODUCT_STATUS } from "@/lib/author-products/moderation";
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

export type ModerationSubmitHeadline = {
  canSubmitNow: boolean;
  question: string;
  answer: "ДА" | "НЕТ";
  reason: string;
};

const SUBMIT_QUESTION = "Можно отправлять на модерацию";
const RESUBMIT_QUESTION = "Можно повторно отправить на модерацию";

/**
 * Headline for support diagnostics: can the author submit RIGHT NOW
 * via the real submit_practice_for_moderation flow.
 *
 * Formula:
 *   evaluatePublishReadiness.ok
 *   AND evaluateDatabaseModerationReady.ok
 *   AND canSubmitPracticeForModeration (eligibility.canSubmitByLifecycle)
 *   AND authorAccessAllowsContentMutations (eligibility.canMutateContent)
 *   AND UI action is submit|resubmit and enabled
 *
 * Bypass Publish is never treated as submit-for-moderation DA.
 */
export function evaluateModerationSubmitHeadline(input: {
  tsReady: boolean;
  dbReady: boolean;
  eligibility: AuthorSubmitEligibility;
}): ModerationSubmitHeadline {
  const { eligibility } = input;
  const fieldsReady = input.tsReady && input.dbReady;
  const isSubmitAction =
    (eligibility.action === "submit" || eligibility.action === "resubmit") &&
    eligibility.enabled;
  const canSubmitNow =
    fieldsReady &&
    isSubmitAction &&
    eligibility.canSubmitByLifecycle &&
    eligibility.canMutateContent;

  const question =
    eligibility.action === "resubmit" ||
    eligibility.visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.CHANGES_REQUESTED
      ? RESUBMIT_QUESTION
      : SUBMIT_QUESTION;

  if (canSubmitNow) {
    return {
      canSubmitNow: true,
      question,
      answer: "ДА",
      reason:
        eligibility.action === "resubmit"
          ? "Продукт можно повторно отправить на модерацию прямо сейчас."
          : "Продукт можно отправить на модерацию прямо сейчас.",
    };
  }

  let reason: string;

  if (eligibility.visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.DELETED) {
    reason = "Продукт удалён.";
  } else if (!eligibility.canMutateContent) {
    reason =
      "Отправка недоступна: авторский доступ приостановлен или завершён.";
  } else if (eligibility.action === "publish") {
    reason =
      "Доступное действие — «Опубликовать» (обход модерации), а не отправка на модерацию. Готовность полей не означает, что автор отправляет продукт на модерацию.";
  } else if (
    eligibility.visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.SUBMITTED
  ) {
    reason = "Продукт уже отправлен на модерацию.";
  } else if (
    eligibility.visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.PUBLISHED
  ) {
    reason = "Продукт уже опубликован.";
  } else if (
    eligibility.visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.UNPUBLISHED
  ) {
    reason =
      "Продукт снят с публикации и одобрен. RPC submit_practice_for_moderation отклонит отправку в этом состоянии.";
  } else if (!fieldsReady) {
    reason =
      "Статусы допускают отправку, но продукт не готов: не проходят evaluatePublishReadiness и/или проверки базы.";
  } else {
    reason = eligibility.reason;
  }

  return {
    canSubmitNow: false,
    question,
    answer: "НЕТ",
    reason,
  };
}
