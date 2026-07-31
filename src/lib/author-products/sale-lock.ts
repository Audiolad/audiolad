import type { SupabaseClient } from "@supabase/supabase-js";

export const PRODUCT_CONTENT_LOCKED_AFTER_SALE =
  "PRODUCT_CONTENT_LOCKED_AFTER_SALE" as const;

/** @deprecated Prefer PRODUCT_DELETE_LOCKED_AFTER_PAID_PURCHASE_MESSAGE in delete-lock.ts */
export const PRODUCT_DELETE_LOCKED_AFTER_SALE_MESSAGE =
  "Удалить этот продукт нельзя, потому что его уже приобрели пользователи. Вы можете снять продукт с публикации – новые покупки прекратятся, а прежние покупатели сохранят доступ.";

export const PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE =
  "Аудиоматериалы этого продукта нельзя удалить или заменить, потому что продукт уже приобретён слушателями.";

export type PracticeSaleLockReason = "entitlement" | "paid_order";

export type PracticeSaleLock = {
  locked: boolean;
  reason: PracticeSaleLockReason | null;
};

export class PracticeSaleLockError extends Error {
  readonly code = PRODUCT_CONTENT_LOCKED_AFTER_SALE;
  readonly status = 409;
  readonly reason: PracticeSaleLockReason | null;
  readonly userMessage: string;

  constructor(
    userMessage: string,
    reason: PracticeSaleLockReason | null = null,
  ) {
    super(PRODUCT_CONTENT_LOCKED_AFTER_SALE);
    this.name = "PracticeSaleLockError";
    this.reason = reason;
    this.userMessage = userMessage;
  }
}

export async function getPracticeSaleLock(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PracticeSaleLock> {
  const { count: entitlementCount, error: entitlementError } = await supabase
    .from("user_practices")
    .select("id", { count: "exact", head: true })
    .eq("practice_id", practiceId);

  if (entitlementError) {
    throw new Error("entitlement_lookup_failed");
  }

  if ((entitlementCount ?? 0) > 0) {
    return { locked: true, reason: "entitlement" };
  }

  const { count: paidOrderCount, error: orderError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("practice_id", practiceId)
    .eq("status", "paid");

  if (orderError) {
    throw new Error("orders_lookup_failed");
  }

  if ((paidOrderCount ?? 0) > 0) {
    return { locked: true, reason: "paid_order" };
  }

  return { locked: false, reason: null };
}

export async function assertPracticeContentMutable(
  supabase: SupabaseClient,
  practiceId: string,
  userMessage: string = PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
): Promise<void> {
  const lock = await getPracticeSaleLock(supabase, practiceId);

  if (lock.locked) {
    throw new PracticeSaleLockError(userMessage, lock.reason);
  }
}

export function isPracticeSaleLockError(
  error: unknown,
): error is PracticeSaleLockError {
  return error instanceof PracticeSaleLockError;
}

export function isProductContentLockedDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const details =
    "details" in error && typeof error.details === "string"
      ? error.details
      : "";
  const hint =
    "hint" in error && typeof error.hint === "string" ? error.hint : "";

  const text = `${message} ${details} ${hint}`;
  return text.includes(PRODUCT_CONTENT_LOCKED_AFTER_SALE);
}

export function saleLockConflictResponse(userMessage: string) {
  return {
    error: PRODUCT_CONTENT_LOCKED_AFTER_SALE,
    message: userMessage,
  };
}
