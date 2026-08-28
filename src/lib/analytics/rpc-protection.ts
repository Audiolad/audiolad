import { ANALYTICS_RPC_TIMEOUT_MS } from "@/lib/analytics/constants";
import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";

export { ANALYTICS_RPC_TIMEOUT_MS };
export const ANALYTICS_HEAVY_RPC_PAIR_LIMIT = 3;
export const ANALYTICS_HEAVY_RPC_IP_LIMIT = 20;
export const ANALYTICS_HEAVY_RPC_WINDOW_MS = 60_000;
export const ANALYTICS_SUCCESS_CACHE_TTL_MS = 10 * 60_000;
export const ANALYTICS_CIRCUIT_WINDOW_MS = 15_000;
export const ANALYTICS_CIRCUIT_OPEN_MS = 30_000;
export const ANALYTICS_CIRCUIT_FAILURE_THRESHOLD = 3;

export type AnalyticsHeavyRpcRoute = "session_link" | "signup_complete" | "track";

export type AnalyticsRpcErrorKind = "overload" | "timeout" | "error";

export type AnalyticsHeavyGuardDecision =
  | { action: "rpc"; key: string; release: (result?: AnalyticsRpcErrorKind | "ok") => void }
  | { action: "rate_limited"; key: string }
  | { action: "deduped"; key: string }
  | { action: "circuit_open"; key: string };

const inflightKeys = new Set<string>();
const successUntil = new Map<string, number>();
const failureTimes: number[] = [];

let circuitOpenUntil = 0;
let rateLimitedCount = 0;
let dedupedCount = 0;
let circuitOpenCount = 0;
let overloadErrorCount = 0;

function nowMs(): number {
  return Date.now();
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/** Decode JWT `sub` for a rate-limit key only. Does not verify the token. */
export function peekJwtSubject(token: string | null | undefined): string | null {
  if (typeof token !== "string") {
    return null;
  }

  const trimmed = token.trim();
  const parts = trimmed.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.trim()
      ? payload.sub.trim()
      : null;
  } catch {
    return null;
  }
}

export function peekUserIdFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization")?.trim();

  if (authHeader?.startsWith("Bearer ")) {
    return peekJwtSubject(authHeader.slice("Bearer ".length));
  }

  return null;
}

export function buildAnalyticsHeavyRpcKey(input: {
  route: AnalyticsHeavyRpcRoute;
  ip: string;
  userId: string | null;
  sessionId: string;
}): string {
  return `${input.route}:${input.ip}:${input.userId ?? "unauth"}:${input.sessionId}`;
}

export function classifyAnalyticsRpcError(error: {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined): { kind: AnalyticsRpcErrorKind; code: string | null } {
  const combined = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (
    combined.includes("pgrst003") ||
    combined.includes("55p03") ||
    combined.includes("too many connections") ||
    combined.includes("remaining connection slots") ||
    combined.includes("connection pool")
  ) {
    return {
      kind: "overload",
      code: combined.includes("55p03") ? "55P03" : "PGRST003",
    };
  }

  if (
    combined.includes("abort") ||
    combined.includes("aborted") ||
    combined.includes("timeout") ||
    combined.includes("timed out") ||
    combined.includes("canceling statement")
  ) {
    return { kind: "timeout", code: "timeout" };
  }

  return { kind: "error", code: error?.code ?? null };
}

export function isAnalyticsOverloadStatus(
  status: number,
  errorCode?: string | null,
): boolean {
  if (errorCode && /pgrst003|55p03|overloaded/i.test(errorCode)) {
    return true;
  }

  return status === 503 || status === 504;
}

function pruneFailures(now: number): void {
  while (failureTimes.length > 0 && now - failureTimes[0] > ANALYTICS_CIRCUIT_WINDOW_MS) {
    failureTimes.shift();
  }
}

export function isAnalyticsCircuitOpen(now: number = nowMs()): boolean {
  return now < circuitOpenUntil;
}

function recordOverload(now: number): void {
  pruneFailures(now);
  failureTimes.push(now);
  overloadErrorCount += 1;

  if (failureTimes.length >= ANALYTICS_CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = now + ANALYTICS_CIRCUIT_OPEN_MS;
    circuitOpenCount += 1;
    console.info("analytics_rpc_protection", {
      event: "circuit_open",
      rate_limited_count: rateLimitedCount,
      deduped_count: dedupedCount,
      circuit_open_count: circuitOpenCount,
      overload_error_count: overloadErrorCount,
      open_ms: ANALYTICS_CIRCUIT_OPEN_MS,
    });
  }
}

function logProtection(
  event: "rate_limited" | "deduped" | "circuit_open" | "rpc_ok" | "rpc_error",
  extra: Record<string, string | number | null>,
): void {
  if (event === "rate_limited") {
    rateLimitedCount += 1;
  } else if (event === "deduped") {
    dedupedCount += 1;
  }

  const count =
    event === "rate_limited"
      ? rateLimitedCount
      : event === "deduped"
        ? dedupedCount
        : event === "circuit_open"
          ? circuitOpenCount
          : overloadErrorCount;

  if (event === "rpc_ok" || event === "rpc_error" || count === 1 || count % 25 === 0) {
    console.info("analytics_rpc_protection", {
      event,
      rate_limited_count: rateLimitedCount,
      deduped_count: dedupedCount,
      circuit_open_count: circuitOpenCount,
      overload_error_count: overloadErrorCount,
      ...extra,
    });
  }
}

export function getAnalyticsRpcProtectionMetrics() {
  return {
    rateLimitedCount,
    dedupedCount,
    circuitOpenCount,
    overloadErrorCount,
    circuitOpen: isAnalyticsCircuitOpen(),
  };
}

export function resetAnalyticsRpcProtectionForTests(): void {
  inflightKeys.clear();
  successUntil.clear();
  failureTimes.length = 0;
  circuitOpenUntil = 0;
  rateLimitedCount = 0;
  dedupedCount = 0;
  circuitOpenCount = 0;
  overloadErrorCount = 0;
}

export function recordAnalyticsRpcOverloadForTests(): void {
  recordOverload(nowMs());
}

export function guardAnalyticsHeavyRpc(input: {
  route: AnalyticsHeavyRpcRoute;
  request: Request;
  sessionId: string;
  userId?: string | null;
}): AnalyticsHeavyGuardDecision {
  const now = nowMs();
  const ip = getClientIp(input.request);
  const userId = input.userId ?? peekUserIdFromRequest(input.request);
  const key = buildAnalyticsHeavyRpcKey({
    route: input.route,
    ip,
    userId,
    sessionId: input.sessionId,
  });

  if (isAnalyticsCircuitOpen(now)) {
    logProtection("circuit_open", { route: input.route });
    return { action: "circuit_open", key };
  }

  const cachedUntil = successUntil.get(key);
  if (cachedUntil && cachedUntil > now) {
    logProtection("deduped", { route: input.route, reason: "success_cache" });
    return { action: "deduped", key };
  }

  if (inflightKeys.has(key)) {
    logProtection("deduped", { route: input.route, reason: "inflight" });
    return { action: "deduped", key };
  }

  const pairLimitKey = `analytics-heavy-pair:${key}`;
  const ipLimitKey = `analytics-heavy-ip:${input.route}:${ip}`;

  if (
    !checkAnalyticsRateLimit(
      pairLimitKey,
      ANALYTICS_HEAVY_RPC_PAIR_LIMIT,
      ANALYTICS_HEAVY_RPC_WINDOW_MS,
    ) ||
    !checkAnalyticsRateLimit(
      ipLimitKey,
      ANALYTICS_HEAVY_RPC_IP_LIMIT,
      ANALYTICS_HEAVY_RPC_WINDOW_MS,
    )
  ) {
    logProtection("rate_limited", { route: input.route });
    return { action: "rate_limited", key };
  }

  inflightKeys.add(key);

  return {
    action: "rpc",
    key,
    release(result = "ok") {
      inflightKeys.delete(key);
      if (result === "ok") {
        successUntil.set(key, nowMs() + ANALYTICS_SUCCESS_CACHE_TTL_MS);
      } else if (result === "overload" || result === "timeout") {
        recordOverload(nowMs());
      }
    },
  };
}

export async function withAnalyticsRpcTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = ANALYTICS_RPC_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

type RpcBuilder<T> = PromiseLike<{ data: T; error: { message?: string; code?: string } | null }> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<{
    data: T;
    error: { message?: string; code?: string } | null;
  }>;
};

export async function invokeAnalyticsRpc<T>(
  builder: RpcBuilder<T>,
): Promise<{
  data: T | null;
  error: { message?: string; code?: string } | null;
  latencyMs: number;
  kind: AnalyticsRpcErrorKind | "ok";
  code: string | null;
}> {
  const started = nowMs();

  try {
    const result = await withAnalyticsRpcTimeout((signal) => {
      if (typeof builder.abortSignal === "function") {
        return Promise.resolve(builder.abortSignal(signal));
      }

      return Promise.resolve(builder);
    });

    const latencyMs = nowMs() - started;
    const classified = classifyAnalyticsRpcError(result.error);

    if (result.error) {
      logProtection("rpc_error", {
        latency_ms: latencyMs,
        code: classified.code,
        kind: classified.kind,
      });
      return {
        data: result.data ?? null,
        error: result.error,
        latencyMs,
        kind: classified.kind,
        code: classified.code,
      };
    }

    logProtection("rpc_ok", { latency_ms: latencyMs });
    return {
      data: result.data ?? null,
      error: null,
      latencyMs,
      kind: "ok",
      code: null,
    };
  } catch (error) {
    const latencyMs = nowMs() - started;
    const classified = classifyAnalyticsRpcError({
      message: error instanceof Error ? error.message : "rpc_failed",
      code: error instanceof Error && error.name === "AbortError" ? "timeout" : null,
    });

    logProtection("rpc_error", {
      latency_ms: latencyMs,
      code: classified.code,
      kind: classified.kind,
    });

    return {
      data: null,
      error: { message: classified.kind, code: classified.code },
      latencyMs,
      kind: classified.kind,
      code: classified.code,
    };
  }
}
