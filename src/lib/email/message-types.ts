export const APPLICATION_EMAIL_MESSAGE_TYPES = [
  "listener_product_update",
  "listener_recommendation",
  "listener_marketing",
  "platform_news",
  "author_operational",
  "author_sales",
  "author_product_status",
  "author_education",
  "author_marketing",
  "support_reply",
] as const;

export type ApplicationEmailMessageType =
  (typeof APPLICATION_EMAIL_MESSAGE_TYPES)[number];

/** GoTrue auth emails are intentionally excluded from application outbox. */
export const EXCLUDED_FROM_APPLICATION_OUTBOX = [
  "auth_signup_confirmation",
  "auth_password_recovery",
  "auth_email_change",
  "auth_magic_link",
] as const;
