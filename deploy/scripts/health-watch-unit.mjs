#!/usr/bin/env node

import {
  evaluateHealthWatchCheck,
  evaluateHttpHealth,
  evaluatePm2Health,
  formatHealthWatchLog,
  parsePm2Jlist,
  snapshotPm2Process,
} from "./lib/pm2-health.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function pm2Current(overrides = {}) {
  return {
    found: true,
    duplicate: false,
    restartTime: 0,
    unstableRestarts: 0,
    status: "online",
    pid: 1000,
    uptime: 10,
    ...overrides,
  };
}

function baseline(overrides = {}) {
  return {
    restartTime: 0,
    unstableRestarts: 0,
    pid: 999,
    ...overrides,
  };
}

function evaluateCase(name, pm2Baseline, pm2CurrentState, httpInput, expectedDecision, expectedReason) {
  const pm2 = evaluatePm2Health({
    baseline: pm2Baseline,
    current: pm2CurrentState,
    maxRestartDelta: 1,
  });
  const http = evaluateHttpHealth(httpInput);
  const result = evaluateHealthWatchCheck({ pm2, http });

  assert(
    result.decision === expectedDecision,
    `${name}: expected decision=${expectedDecision}, got=${result.decision} (${result.reasons.join(",")})`,
  );

  if (expectedReason) {
    assert(
      result.reasons.includes(expectedReason),
      `${name}: expected reason=${expectedReason}, got=${result.reasons.join(",")}`,
    );
  }
}

function testHealthyAfterSingleDeployRestart() {
  evaluateCase(
    "baseline 7 current 8",
    baseline({ restartTime: 7 }),
    pm2Current({ restartTime: 8, pid: 2001 }),
    { httpOk: true, httpStatus: 200, buildIdMatch: true, guestHomeOk: true },
    "healthy",
  );
}

function testHealthyFromZeroBaseline() {
  evaluateCase(
    "baseline 0 current 1",
    baseline({ restartTime: 0 }),
    pm2Current({ restartTime: 1 }),
    { httpOk: true, httpStatus: 200, buildIdMatch: true, guestHomeOk: true },
    "healthy",
  );
}

function testCrashLoopOnRestartGrowth() {
  evaluateCase(
    "baseline 7 current 10",
    baseline({ restartTime: 7 }),
    pm2Current({ restartTime: 10, status: "online" }),
    { httpOk: true, httpStatus: 200, buildIdMatch: true, guestHomeOk: true },
    "rollback",
    "pm2_restart_loop",
  );
}

function testErroredStatusRollback() {
  evaluateCase(
    "status errored without restart growth",
    baseline({ restartTime: 7 }),
    pm2Current({ restartTime: 7, status: "errored" }),
    { httpOk: true, httpStatus: 200, buildIdMatch: true, guestHomeOk: true },
    "rollback",
    "pm2_status_errored",
  );
}

function testMissingProcessRollback() {
  evaluateCase(
    "process missing",
    baseline({ restartTime: 2 }),
    pm2Current({ found: false, status: "missing", pid: null }),
    { httpOk: true, httpStatus: 200, buildIdMatch: true, guestHomeOk: true },
    "rollback",
    "pm2_process_missing",
  );
}

function testHttpHealthFailureRollback() {
  const pm2 = evaluatePm2Health({
    baseline: baseline({ restartTime: 3 }),
    current: pm2Current({ restartTime: 4 }),
    maxRestartDelta: 1,
  });
  const http = evaluateHttpHealth({ httpOk: false, httpStatus: null });
  const result = evaluateHealthWatchCheck({ pm2, http });

  assert(result.decision === "rollback", "http failure should rollback");
  assert(
    result.reasons.includes("health_endpoint_unreachable"),
    "http failure reason missing",
  );
}

function testTransientHttpFailureNotImmediateRollbackByItself() {
  const httpFail = evaluateHttpHealth({ httpOk: false, httpStatus: null });
  const httpOk = evaluateHttpHealth({
    httpOk: true,
    httpStatus: 200,
    buildIdMatch: true,
    guestHomeOk: true,
  });

  assert(httpFail.decision === "rollback", "single failed http check is unhealthy");
  assert(httpOk.decision === "healthy", "recovered http check is healthy");
}

function testInvalidPm2JsonWatchCheck() {
  const jlist = "{not-json";
  const result = parsePm2Jlist.bind(null, jlist);
  let threw = false;
  try {
    result();
  } catch (error) {
    threw = true;
    assert(String(error).includes("invalid_pm2_jlist"), "invalid json watch-check");
  }
  assert(threw, "invalid pm2 json in watch-check path must throw");
}

function testUnstableRestartsGrowthRollback() {
  evaluateCase(
    "unstable restarts growth",
    baseline({ restartTime: 4, unstableRestarts: 0 }),
    pm2Current({ restartTime: 5, unstableRestarts: 2 }),
    { httpOk: true, httpStatus: 200, buildIdMatch: true, guestHomeOk: true },
    "rollback",
    "pm2_unstable_restarts_growth",
  );
}

function testBaselineAfterReloadHealthy() {
  evaluateCase(
    "post-reload baseline reset",
    baseline({ restartTime: 7421 }),
    pm2Current({ restartTime: 7421, pid: 3415095 }),
    { httpOk: true, httpStatus: 200, buildIdMatch: true, guestHomeOk: true },
    "healthy",
  );
}

function testBuildIdMismatchRollback() {
  evaluateCase(
    "build id mismatch during transition",
    baseline({ restartTime: 7421 }),
    pm2Current({ restartTime: 7421, pid: 3419288 }),
    { httpOk: true, httpStatus: 200, buildIdMatch: false, guestHomeOk: true },
    "rollback",
    "build_id_mismatch",
  );
}

function testAccumulatedRestartWithoutGrowthHealthy() {
  evaluateCase(
    "old accumulated restart count without new growth",
    baseline({ restartTime: 7 }),
    pm2Current({ restartTime: 7 }),
    { httpOk: true, httpStatus: 200, buildIdMatch: true, guestHomeOk: true },
    "healthy",
  );
}

function testSnapshotParser() {
  const jlist = JSON.stringify([
    {
      name: "audiolad",
      pid: 321,
      pm2_env: {
        restart_time: 7,
        unstable_restarts: 0,
        status: "online",
        pm_uptime: 42,
      },
    },
  ]);

  const snapshot = snapshotPm2Process(jlist, "audiolad");
  assert(snapshot.restartTime === 7, "snapshot restartTime");
  assert(snapshot.status === "online", "snapshot status");
  assert(snapshot.pid === 321, "snapshot pid");
}

function testLogFormat() {
  const pm2 = evaluatePm2Health({
    baseline: baseline({ restartTime: 7 }),
    current: pm2Current({ restartTime: 8 }),
    maxRestartDelta: 1,
  });
  const http = evaluateHttpHealth({
    httpOk: true,
    httpStatus: 200,
    buildIdMatch: true,
    guestHomeOk: true,
  });
  const result = evaluateHealthWatchCheck({ pm2, http });
  const log = formatHealthWatchLog(result);

  assert(log.includes("pm2_restart_baseline=7"), "log baseline");
  assert(log.includes("pm2_restart_current=8"), "log current");
  assert(log.includes("pm2_restart_delta=1"), "log delta");
  assert(log.includes("decision=healthy"), "log decision");
}

const tests = [
  testHealthyAfterSingleDeployRestart,
  testHealthyFromZeroBaseline,
  testCrashLoopOnRestartGrowth,
  testErroredStatusRollback,
  testMissingProcessRollback,
  testHttpHealthFailureRollback,
  testTransientHttpFailureNotImmediateRollbackByItself,
  testInvalidPm2JsonWatchCheck,
  testUnstableRestartsGrowthRollback,
  testAccumulatedRestartWithoutGrowthHealthy,
  testBaselineAfterReloadHealthy,
  testBuildIdMismatchRollback,
  testSnapshotParser,
  testLogFormat,
];

for (const run of tests) {
  run();
}

console.log(`health-watch-unit: ${tests.length} tests passed`);
