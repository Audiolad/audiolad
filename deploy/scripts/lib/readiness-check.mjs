#!/usr/bin/env node

/**
 * Production readiness probe for /api/health/build.
 * Used by deploy/rollback scripts and readiness-check-unit.mjs.
 */

/**
 * @param {{
 *   httpStatus: number | null,
 *   body?: string | null,
 *   expectedBuildId?: string | null,
 * }} input
 * @returns {{
 *   ready: boolean,
 *   httpStatus: number | null,
 *   reason: string,
 *   buildId: string | null,
 *   status: string | null,
 * }}
 */
export function evaluateReadinessResponse(input) {
  const httpStatus =
    typeof input.httpStatus === "number" && Number.isFinite(input.httpStatus)
      ? input.httpStatus
      : null;
  const expectedBuildId =
    typeof input.expectedBuildId === "string" && input.expectedBuildId.length > 0
      ? input.expectedBuildId
      : null;

  if (httpStatus === null) {
    return {
      ready: false,
      httpStatus: null,
      reason: "probe_failed",
      buildId: null,
      status: null,
    };
  }

  if (httpStatus !== 200) {
    return {
      ready: false,
      httpStatus,
      reason: `http_${httpStatus}`,
      buildId: null,
      status: null,
    };
  }

  let payload;
  try {
    payload = JSON.parse(String(input.body ?? ""));
  } catch {
    return {
      ready: false,
      httpStatus,
      reason: "invalid_json",
      buildId: null,
      status: null,
    };
  }

  const status = typeof payload.status === "string" ? payload.status : null;
  const buildId =
    typeof payload.buildId === "string" && payload.buildId.length > 0
      ? payload.buildId
      : null;

  if (status !== "ok") {
    return {
      ready: false,
      httpStatus,
      reason: status ? `status_${status}` : "status_missing",
      buildId,
      status,
    };
  }

  if (expectedBuildId && buildId !== expectedBuildId) {
    return {
      ready: false,
      httpStatus,
      reason: "build_id_mismatch",
      buildId,
      status,
    };
  }

  return {
    ready: true,
    httpStatus,
    reason: "ok",
    buildId,
    status,
  };
}

/**
 * @param {string} url
 * @param {{ expectedBuildId?: string | null, timeoutMs?: number }} [options]
 */
export async function probeReadiness(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      redirect: "follow",
    });
    const body = await response.text();

    return evaluateReadinessResponse({
      httpStatus: response.status,
      body,
      expectedBuildId: options.expectedBuildId ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ready: false,
      httpStatus: null,
      reason: message.includes("abort") ? "probe_timeout" : "probe_failed",
      buildId: null,
      status: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function readArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return null;
  }
  return process.argv[index + 1];
}

async function runCli() {
  const command = process.argv[2];

  if (command === "probe") {
    const url = readArgValue("--url");
    if (!url) {
      throw new Error("missing --url");
    }

    const expectedBuildId = readArgValue("--expected-build-id");
    const result = await probeReadiness(url, { expectedBuildId });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(result.ready ? 0 : 1);
  }

  throw new Error(`unknown_command:${command ?? "missing"}`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
