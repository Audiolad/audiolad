export const COURSE_UPGRADE_CHECKOUT_STAGES = {
  AUTH: "auth",
  PARSE: "parse",
  CREATE_ORDER: "create_course_upgrade_order",
  COERCE: "coerceCourseUpgradeOrderRow",
  RELOAD: "reload_orders_row",
  START_TOCHKA: "startTochkaCheckoutForPendingOrder",
  ACCRUAL: "getOrderSaleAccrualReady",
  EXISTING_PAYMENTS: "existing_payments_lookup",
  PAYMENT_INSERT_REUSE: "payment_insert_or_reuse",
  CREATE_TOCHKA: "createTochkaPaymentOperation",
  METADATA_SAVE: "provider_metadata_save",
  PAYMENT_URL: "payment_url_returned",
} as const;

export type CourseUpgradeCheckoutStage =
  (typeof COURSE_UPGRADE_CHECKOUT_STAGES)[keyof typeof COURSE_UPGRADE_CHECKOUT_STAGES];

export function logCourseUpgradeFailure(input: {
  stage: string;
  error: string;
  status: number;
  orderId?: string | null;
  practiceId?: string | null;
  targetAccessLevel?: number | null;
}): void {
  console.error("course_upgrade_failed", {
    FAILED_STAGE: input.stage,
    ACTUAL_API_ERROR: input.error,
    ACTUAL_HTTP_STATUS: input.status,
    order_id: input.orderId ?? null,
    practice_id: input.practiceId ?? null,
    target_access_level: input.targetAccessLevel ?? null,
  });
}
