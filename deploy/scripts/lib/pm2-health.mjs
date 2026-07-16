#!/usr/bin/env node

/**
 * Pure PM2 health evaluation for deploy health-watch.
 * Used by health-watch.sh and health-watch-unit.mjs.
 */

const DEFAULT_MAX_RESTART_DELTA = 1;

/**
 * @param {string} raw
 * @returns {unknown[]}
 */
export function parsePm2Jlist(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid_pm2_jlist:${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("invalid_pm2_jlist:not_array");
  }

  return parsed;
}

/**
 * @param {unknown[]} apps
 * @param {string} appName
 * @returns {{ found: boolean, duplicate: boolean, process: Record<string, unknown> | null }}
 */
export function findPm2Process(apps, appName) {
  const matches = apps.filter((app) => {
    return typeof app === "object" && app !== null && app.name === appName;
  });

  if (matches.length === 0) {
    return { found: false, duplicate: false, process: null };
  }

  if (matches.length > 1) {
    return { found: true, duplicate: true, process: matches[0] };
  }

  return { found: true, duplicate: false, process: matches[0] };
}

/**
 * @param {Record<string, unknown> | null} process
 * @returns {{
 *   restartTime: number,
 *   unstableRestarts: number,
 *   status: string,
 *   pid: number | null,
 *   uptime: number,
 * }}
 */
export function extractPm2Metrics(process) {
  if (!process) {
    return {
      restartTime: 0,
      unstableRestarts: 0,
      status: "missing",
      pid: null,
      uptime: 0,
    };
  }

  const env =
    typeof process.pm2_env === "object" && process.pm2_env !== null
      ? process.pm2_env
      : {};

  const pidValue = process.pid;
  const pid =
    typeof pidValue === "number" && Number.isFinite(pidValue) ? pidValue : null;

  return {
    restartTime: toNonNegativeInt(env.restart_time, 0),
    unstableRestarts: toNonNegativeInt(env.unstable_restarts, 0),
    status: typeof env.status === "string" ? env.status : "unknown",
    pid,
    uptime: toNonNegativeInt(env.pm_uptime, 0),
  };
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function toNonNegativeInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

/**
 * @param {string} raw
 * @param {string} appName
 */
export function snapshotPm2Process(raw, appName) {
  const apps = parsePm2Jlist(raw);
  const lookup = findPm2Process(apps, appName);
  const metrics = extractPm2Metrics(lookup.process);

  return {
    appName,
    capturedAt: new Date().toISOString(),
    found: lookup.found,
    duplicate: lookup.duplicate,
    ...metrics,
  };
}

/**
 * @param {{
 *   baseline?: {
 *     restartTime?: number,
 *     unstableRestarts?: number,
 *     pid?: number | null,
 *   } | null,
 *   current: ReturnType<typeof extractPm2Metrics> & { found?: boolean, duplicate?: boolean },
 *   maxRestartDelta?: number,
 * }} input
 */
export function evaluatePm2Health(input) {
  const baseline = input.baseline ?? {
    restartTime: 0,
    unstableRestarts: 0,
    pid: null,
  };
  const current = input.current;
  const maxRestartDelta =
    input.maxRestartDelta ?? DEFAULT_MAX_RESTART_DELTA;

  const restartBaseline = toNonNegativeInt(baseline.restartTime, 0);
  const unstableBaseline = toNonNegativeInt(baseline.unstableRestarts, 0);
  const restartCurrent = toNonNegativeInt(current.restartTime, 0);
  const unstableCurrent = toNonNegativeInt(current.unstableRestarts, 0);
  const restartDelta = Math.max(0, restartCurrent - restartBaseline);
  const unstableDelta = Math.max(0, unstableCurrent - unstableBaseline);

  const metrics = {
    restartBaseline,
    restartCurrent,
    restartDelta,
    unstableBaseline,
    unstableCurrent,
    unstableDelta,
    status: current.status,
    pid: current.pid,
    uptime: current.uptime,
  };

  const reasons = [];

  if (current.duplicate) {
    reasons.push("pm2_duplicate_process");
  }

  if (!current.found) {
    reasons.push("pm2_process_missing");
  }

  if (current.status !== "online") {
    reasons.push(`pm2_status_${current.status}`);
  }

  if (restartDelta > maxRestartDelta) {
    reasons.push("pm2_restart_loop");
  }

  if (unstableDelta > 0) {
    reasons.push("pm2_unstable_restarts_growth");
  }

  const healthy = reasons.length === 0;

  return {
    healthy,
    decision: healthy ? "healthy" : "rollback",
    reasons,
    metrics,
  };
}

/**
 * @param {{
 *   httpOk: boolean,
 *   httpStatus?: number | null,
 *   buildIdMatch?: boolean,
 *   guestHomeOk?: boolean,
 *   globalErrorDetected?: boolean,
 *   criticalRuntimeError?: boolean,
 * }} input
 */
export function evaluateHttpHealth(input) {
  const reasons = [];

  if (!input.httpOk) {
    reasons.push("health_endpoint_unreachable");
  } else if (input.buildIdMatch === false) {
    reasons.push("build_id_mismatch");
  }

  if (input.guestHomeOk === false) {
    reasons.push("guest_home_marker_missing");
  }

  if (input.globalErrorDetected) {
    reasons.push("global_error_detected");
  }

  if (input.criticalRuntimeError) {
    reasons.push("critical_runtime_error_since_watch_start");
  }

  return {
    healthy: reasons.length === 0,
    decision: reasons.length === 0 ? "healthy" : "rollback",
    reasons,
    httpStatus: input.httpStatus ?? null,
  };
}

/**
 * @param {{
 *   pm2: ReturnType<typeof evaluatePm2Health>,
 *   http: ReturnType<typeof evaluateHttpHealth>,
 * }} input
 */
export function evaluateHealthWatchCheck(input) {
  const reasons = [...input.pm2.reasons, ...input.http.reasons];
  const healthy = reasons.length === 0;

  return {
    healthy,
    decision: healthy ? "healthy" : "rollback",
    reasons,
    pm2: input.pm2.metrics,
    httpStatus: input.http.httpStatus,
  };
}

/**
 * @param {ReturnType<typeof evaluateHealthWatchCheck>} result
 */
export function formatHealthWatchLog(result) {
  const pm2 = result.pm2;
  const lines = [
    `pm2_restart_baseline=${pm2.restartBaseline}`,
    `pm2_restart_current=${pm2.restartCurrent}`,
    `pm2_restart_delta=${pm2.restartDelta}`,
    `pm2_unstable_baseline=${pm2.unstableBaseline}`,
    `pm2_unstable_current=${pm2.unstableCurrent}`,
    `pm2_unstable_delta=${pm2.unstableDelta}`,
    `pm2_status=${pm2.status}`,
    `pm2_pid=${pm2.pid ?? "null"}`,
    `pm2_uptime=${pm2.uptime}`,
    `health_http=${result.httpStatus ?? "unreachable"}`,
    `decision=${result.decision}`,
  ];

  if (!result.healthy) {
    lines.push(`reason=${result.reasons.join(",")}`);
  }

  return lines.join("\n");
}

function readArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return null;
  }
  return process.argv[index + 1];
}

async function readAllStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readBaselineFile(baselineFile) {
  if (!baselineFile) {
    return null;
  }

  const { readFileSync, existsSync } = await import("node:fs");
  if (!existsSync(baselineFile)) {
    return null;
  }

  const raw = readFileSync(baselineFile, "utf8").trim();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

async function runCli() {
  const command = process.argv[2];

  if (command === "snapshot") {
    const appName = readArgValue("--app") ?? "audiolad";
    const jlistArg = readArgValue("--jlist");
    const raw = jlistArg ?? (await readAllStdin());
    const snapshot = snapshotPm2Process(raw, appName);
    process.stdout.write(`${JSON.stringify(snapshot)}\n`);
    return;
  }

  if (command === "evaluate") {
    const appName = readArgValue("--app") ?? "audiolad";
    const baselineFile = readArgValue("--baseline-file");
    const jlistArg = readArgValue("--jlist");
    const maxRestartDelta = Number(
      readArgValue("--max-restart-delta") ?? DEFAULT_MAX_RESTART_DELTA,
    );
    const raw = jlistArg ?? (await readAllStdin());
    const baseline = await readBaselineFile(baselineFile);

    const apps = parsePm2Jlist(raw);
    const lookup = findPm2Process(apps, appName);
    const current = {
      ...extractPm2Metrics(lookup.process),
      found: lookup.found,
      duplicate: lookup.duplicate,
    };

    const pm2 = evaluatePm2Health({
      baseline,
      current,
      maxRestartDelta,
    });

    process.stdout.write(`${JSON.stringify(pm2)}\n`);
    return;
  }

  if (command === "watch-check") {
    const appName = readArgValue("--app") ?? "audiolad";
    const baselineFile = readArgValue("--baseline-file");
    const jlistArg = readArgValue("--jlist");
    const maxRestartDelta = Number(
      readArgValue("--max-restart-delta") ?? DEFAULT_MAX_RESTART_DELTA,
    );
    const raw = jlistArg ?? (await readAllStdin());
    const baseline = await readBaselineFile(baselineFile);

    let apps;
    try {
      apps = parsePm2Jlist(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = {
        healthy: false,
        decision: "rollback",
        reasons: ["pm2_jlist_eval_failed"],
        pm2: {
          restartBaseline: baseline?.restartTime ?? 0,
          restartCurrent: 0,
          restartDelta: 0,
          unstableBaseline: baseline?.unstableRestarts ?? 0,
          unstableCurrent: 0,
          unstableDelta: 0,
          status: "unknown",
          pid: null,
          uptime: 0,
        },
        httpStatus: readArgValue("--http-status") ?? "unreachable",
        log: `decision=rollback\nreason=pm2_jlist_eval_failed\npm2_error=${message}`,
        pid: null,
      };
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }

    const lookup = findPm2Process(apps, appName);
    const current = {
      ...extractPm2Metrics(lookup.process),
      found: lookup.found,
      duplicate: lookup.duplicate,
    };

    const pm2 = evaluatePm2Health({
      baseline,
      current,
      maxRestartDelta,
    });
    const http = evaluateHttpHealth({
      httpOk: readArgValue("--http-ok") === "true",
      httpStatus:
        readArgValue("--http-status") === "unreachable"
          ? null
          : Number(readArgValue("--http-status") ?? 0),
      buildIdMatch: readArgValue("--build-id-match") !== "false",
      guestHomeOk: readArgValue("--guest-home-ok") !== "false",
      globalErrorDetected: readArgValue("--global-error") === "true",
      criticalRuntimeError: readArgValue("--critical-runtime-error") === "true",
    });
    const combined = evaluateHealthWatchCheck({ pm2, http });
    const result = {
      ...combined,
      log: formatHealthWatchLog(combined),
      pid: combined.pm2.pid,
    };

    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
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
