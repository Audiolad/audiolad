import {
  buildClientErrorDedupeKey,
  classifyClientErrorType,
} from "@/lib/client-errors/sanitize";
import type { ClientErrorReport } from "@/lib/client-errors/types";

const DEDUPE_WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 8_192;
const BUILD_ID_TTL_MS = 5 * 60_000;

let reporterInstalled = false;

let cachedBuildId: string | null = null;
let cachedBuildIdAt = 0;
const recentReports = new Map<string, number>();

function pruneRecentReports(now: number): void {
  for (const [key, reportedAt] of recentReports.entries()) {
    if (now - reportedAt > DEDUPE_WINDOW_MS) {
      recentReports.delete(key);
    }
  }
}

function shouldReport(dedupeKey: string, now: number): boolean {
  pruneRecentReports(now);

  const previous = recentReports.get(dedupeKey);

  if (previous && now - previous < DEDUPE_WINDOW_MS) {
    return false;
  }

  recentReports.set(dedupeKey, now);
  return true;
}

async function resolveBuildId(): Promise<string | null> {
  const now = Date.now();

  if (cachedBuildId && now - cachedBuildIdAt < BUILD_ID_TTL_MS) {
    return cachedBuildId;
  }

  try {
    const response = await fetch("/api/health/build", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return cachedBuildId;
    }

    const payload = (await response.json()) as { buildId?: unknown };
    cachedBuildId =
      typeof payload.buildId === "string" ? payload.buildId : null;
    cachedBuildIdAt = now;
  } catch {
    // Non-blocking
  }

  return cachedBuildId;
}

function buildReport(input: {
  message: string;
  stack?: string | null;
  source?: string | null;
  buildId?: string | null;
}): ClientErrorReport {
  const message = input.message;
  const stack = input.stack ?? null;

  return {
    type: classifyClientErrorType(message, stack),
    message,
    stack,
    source: input.source ?? null,
    pathname:
      typeof window !== "undefined" ? window.location.pathname : "/",
    href: typeof window !== "undefined" ? window.location.href : "/",
    userAgent:
      typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    buildId: input.buildId ?? null,
    hasServiceWorker:
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      Boolean(navigator.serviceWorker.controller),
    timestamp: new Date().toISOString(),
  };
}

async function sendReport(report: ClientErrorReport): Promise<void> {
  const dedupeKey = buildClientErrorDedupeKey(report);

  if (!shouldReport(dedupeKey, Date.now())) {
    return;
  }

  const body = JSON.stringify(report);

  if (body.length > MAX_BODY_BYTES) {
    return;
  }

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon("/api/client-errors", blob);

      if (sent) {
        return;
      }
    }

    await fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Reporting must never throw
  }
}

export async function reportClientError(input: {
  message: string;
  stack?: string | null;
  source?: string | null;
}): Promise<void> {
  const buildId = await resolveBuildId();
  const report = buildReport({ ...input, buildId });
  await sendReport(report);
}

export function installClientErrorReporter(): void {
  if (typeof window === "undefined" || reporterInstalled) {
    return;
  }

  reporterInstalled = true;

  window.addEventListener("error", (event) => {
    const message =
      event.message ||
      (event.error instanceof Error ? event.error.message : "window_error");
    const stack =
      event.error instanceof Error
        ? event.error.stack ?? null
        : null;

    void reportClientError({
      message,
      stack,
      source: event.filename ?? null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "unhandled_rejection";
    const stack = reason instanceof Error ? reason.stack ?? null : null;

    void reportClientError({ message, stack });
  });
}
