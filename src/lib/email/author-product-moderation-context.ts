/**
 * Shared context contracts for practice_moderation_email_outbox.
 *
 * Author-facing outcomes (changes_requested, approved_and_published) and
 * admin-facing submit alerts (submitted, resubmitted) share one outbox table.
 * The database enqueue side snapshots the matching shape into `context`;
 * the worker validates and forwards it without recomputing.
 */
export type AuthorProductModerationAuthorOutboxAction =
  | "changes_requested"
  | "approved_and_published";

export type AuthorProductModerationAdminOutboxAction =
  | "submitted"
  | "resubmitted";

export type AuthorProductModerationOutboxAction =
  | AuthorProductModerationAuthorOutboxAction
  | AuthorProductModerationAdminOutboxAction;

export type AuthorProductModerationEmailContext = {
  product_title: string | null;
  author_dashboard_path: string;
  public_product_path: string | null;
  moderator_comment: string | null;
};

export type AuthorProductModerationAdminEmailContext = {
  product_id: string;
  product_title: string | null;
  author_name: string | null;
  author_project_name: string | null;
  product_kind_label: string;
  price_label: string;
  audio_track_count: number;
  submission_kind_label: string;
  submitted_at: string | null;
  admin_review_path: string;
};

export function isAuthorProductModerationAuthorOutboxAction(
  value: unknown,
): value is AuthorProductModerationAuthorOutboxAction {
  return value === "changes_requested" || value === "approved_and_published";
}

export function isAuthorProductModerationAdminOutboxAction(
  value: unknown,
): value is AuthorProductModerationAdminOutboxAction {
  return value === "submitted" || value === "resubmitted";
}

export function isAuthorProductModerationOutboxAction(
  value: unknown,
): value is AuthorProductModerationOutboxAction {
  return (
    isAuthorProductModerationAuthorOutboxAction(value) ||
    isAuthorProductModerationAdminOutboxAction(value)
  );
}

export function isAuthorProductModerationEmailContext(
  value: unknown,
): value is AuthorProductModerationEmailContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    (record.product_title === null || typeof record.product_title === "string") &&
    typeof record.author_dashboard_path === "string" &&
    record.author_dashboard_path.length > 0 &&
    (record.public_product_path === null ||
      typeof record.public_product_path === "string") &&
    (record.moderator_comment === null || typeof record.moderator_comment === "string")
  );
}

export function isAuthorProductModerationAdminEmailContext(
  value: unknown,
): value is AuthorProductModerationAdminEmailContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.product_id === "string" &&
    record.product_id.length > 0 &&
    (record.product_title === null || typeof record.product_title === "string") &&
    (record.author_name === null || typeof record.author_name === "string") &&
    (record.author_project_name === null ||
      typeof record.author_project_name === "string") &&
    typeof record.product_kind_label === "string" &&
    record.product_kind_label.length > 0 &&
    typeof record.price_label === "string" &&
    record.price_label.length > 0 &&
    typeof record.audio_track_count === "number" &&
    Number.isFinite(record.audio_track_count) &&
    record.audio_track_count >= 0 &&
    typeof record.submission_kind_label === "string" &&
    record.submission_kind_label.length > 0 &&
    (record.submitted_at === null || typeof record.submitted_at === "string") &&
    typeof record.admin_review_path === "string" &&
    record.admin_review_path.startsWith("/admin/product-moderation/")
  );
}

export function resolveAuthorProductModerationAbsoluteUrl(
  siteOrigin: string,
  path: string,
): string {
  return `${siteOrigin.replace(/\/$/, "")}${path}`;
}
