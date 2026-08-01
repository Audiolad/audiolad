/**
 * Shared context contract for the two author product moderation emails
 * (changes_requested, approved_and_published). The database enqueue side
 * (`log_practice_moderation_event` in
 * 20260801140000_practice_moderation_email_outbox.sql) snapshots this exact
 * shape into `practice_moderation_email_outbox.context`; the worker only
 * needs to validate and forward it, never recompute it.
 */
export type AuthorProductModerationOutboxAction =
  | "changes_requested"
  | "approved_and_published";

export type AuthorProductModerationEmailContext = {
  product_title: string | null;
  author_dashboard_path: string;
  public_product_path: string | null;
  moderator_comment: string | null;
};

export function isAuthorProductModerationOutboxAction(
  value: unknown,
): value is AuthorProductModerationOutboxAction {
  return value === "changes_requested" || value === "approved_and_published";
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

export function resolveAuthorProductModerationAbsoluteUrl(
  siteOrigin: string,
  path: string,
): string {
  return `${siteOrigin.replace(/\/$/, "")}${path}`;
}
