import type { SupabaseClient } from "@supabase/supabase-js";

export const PRODUCT_PAID_PURCHASE_DELETE_LOCK = "paid_purchase_exists" as const;

export const PRODUCT_DELETE_LOCKED_AFTER_PAID_PURCHASE_MESSAGE =
  "Удалить этот продукт нельзя, потому что его уже приобрели пользователи. Вы можете снять продукт с публикации – новые покупки прекратятся, а прежние покупатели сохранят доступ.";

export type PracticeDeleteLock = {
  locked: boolean;
  reason: "paid_order" | null;
};

/**
 * Delete-lock is narrower than content/sale-lock.
 * Soft delete is blocked only by completed paid orders (orders.status = 'paid').
 * Free entitlements (free_claim, starter, gift, admin, etc.) do not block delete.
 */
export async function getPracticeDeleteLock(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PracticeDeleteLock> {
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("practice_id", practiceId)
    .eq("status", "paid");

  if (error) {
    throw new Error("orders_lookup_failed");
  }

  if ((count ?? 0) > 0) {
    return { locked: true, reason: "paid_order" };
  }

  return { locked: false, reason: null };
}

export class PracticeDeleteLockError extends Error {
  readonly code = PRODUCT_PAID_PURCHASE_DELETE_LOCK;
  readonly status = 409;
  readonly userMessage = PRODUCT_DELETE_LOCKED_AFTER_PAID_PURCHASE_MESSAGE;

  constructor() {
    super(PRODUCT_PAID_PURCHASE_DELETE_LOCK);
    this.name = "PracticeDeleteLockError";
  }
}

export function isPracticeDeleteLockError(
  error: unknown,
): error is PracticeDeleteLockError {
  return error instanceof PracticeDeleteLockError;
}
