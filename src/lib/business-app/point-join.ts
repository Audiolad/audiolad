import { isPointToken } from "@/lib/business-app/point-session";
import { pointWaitMinutes } from "@/lib/business-app/point-share";

export const POINT_JOIN_WRONG = "Код не подошёл. Проверьте цифры или получите новый код в кабинете.";
export const POINT_JOIN_FAILED = "Не удалось подключить устройство. Попробуйте ещё раз.";

export type PointJoinResult =
  | { ok: true; token: string; locationName: string }
  | { ok: false; status: number; reason: "invalid_point_code" | "too_many_attempts" | "join_failed"; error: string };

/** Maps redeem_business_point_pairing output to the route answer. */
export function pointJoinResult(data: unknown): PointJoinResult {
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (!row) return { ok: false, status: 503, reason: "join_failed", error: POINT_JOIN_FAILED };
  if (row.ok === true && isPointToken(row.token as string | undefined)) {
    return { ok: true, token: row.token as string, locationName: typeof row.location_name === "string" ? row.location_name : "" };
  }
  if (row.reason === "too_many_attempts") {
    const seconds = typeof row.retry_after === "number" && row.retry_after > 0 ? row.retry_after : 600;
    return {
      ok: false,
      status: 429,
      reason: "too_many_attempts",
      error: `Слишком много неверных кодов. Подождите ${pointWaitMinutes(seconds)} и попробуйте снова.`,
    };
  }
  if (row.reason === "invalid_point_code") {
    return { ok: false, status: 200, reason: "invalid_point_code", error: POINT_JOIN_WRONG };
  }
  return { ok: false, status: 503, reason: "join_failed", error: POINT_JOIN_FAILED };
}
