type AnalyticsRpcErrorLike = {
  message?: string | null;
  code?: string | null;
};

/**
 * Lock / pool / statement timeouts on best-effort analytics RPCs.
 * These must never be treated as product 500s and must not be retried immediately.
 */
export function isAnalyticsBestEffortRpcError(
  error: AnalyticsRpcErrorLike | null | undefined,
): boolean {
  if (!error) {
    return false;
  }

  const code = (error.code ?? "").toUpperCase();
  const message = (error.message ?? "").toLowerCase();

  return (
    code === "55P03" ||
    code === "57014" ||
    code === "PGRST003" ||
    message.includes("lock timeout") ||
    message.includes("lock_not_available") ||
    message.includes("timed out acquiring connection") ||
    message.includes("statement timeout") ||
    message.includes("canceling statement")
  );
}

export function isAnalyticsPoolExhaustionStatus(status: number): boolean {
  return status === 503 || status === 504;
}
