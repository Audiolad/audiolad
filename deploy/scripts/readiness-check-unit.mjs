#!/usr/bin/env node

import { mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  evaluateReadinessResponse,
  resolveReadinessInvocationMode,
} from "./lib/readiness-check.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const readinessScript = join(scriptDir, "lib/readiness-check.mjs");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function okBody(buildId = "expected-build") {
  return JSON.stringify({
    status: "ok",
    buildId,
    processStartedAt: "2026-07-19T10:00:00.000Z",
    nodeEnv: "production",
    cwd: "/var/www/audiolad-deploy/current",
    pid: 123,
  });
}

function evaluateSequence(sequence, expectedBuildId) {
  for (const step of sequence) {
    const result = evaluateReadinessResponse({
      httpStatus: step.httpStatus,
      body: step.body ?? null,
      expectedBuildId,
    });

    if (result.ready) {
      return { ready: true, attempts: step.attempt ?? null, result };
    }
  }

  const last = sequence[sequence.length - 1];
  const lastResult = evaluateReadinessResponse({
    httpStatus: last.httpStatus,
    body: last.body ?? null,
    expectedBuildId,
  });

  return { ready: false, attempts: sequence.length, result: lastResult };
}

function test502RecoverySequence() {
  const outcome = evaluateSequence(
    [
      { httpStatus: 502, attempt: 1 },
      { httpStatus: 502, attempt: 2 },
      { httpStatus: 200, body: okBody("target-build"), attempt: 3 },
    ],
    "target-build",
  );

  assert(outcome.ready, "expected readiness after 502,502,200 sequence");
  assert(outcome.result.reason === "ok", "expected ok reason");
}

function testPermanent502Timeout() {
  const attempts = 5;
  let sawReady = false;

  for (let i = 1; i <= attempts; i += 1) {
    const result = evaluateReadinessResponse({ httpStatus: 502 });
    if (result.ready) {
      sawReady = true;
      break;
    }
    assert(result.reason === "http_502", "expected http_502 reason");
  }

  assert(!sawReady, "permanent 502 must never become ready");
}

function testWrongBuildIdKeepsWaiting() {
  const result = evaluateReadinessResponse({
    httpStatus: 200,
    body: okBody("old-build"),
    expectedBuildId: "new-build",
  });

  assert(!result.ready, "wrong buildId must not be ready");
  assert(result.reason === "build_id_mismatch", "expected build_id_mismatch");
}

function testMatchingBuildIdReady() {
  const result = evaluateReadinessResponse({
    httpStatus: 200,
    body: okBody("new-build"),
    expectedBuildId: "new-build",
  });

  assert(result.ready, "matching buildId must be ready");
  assert(result.reason === "ok", "expected ok reason");
}

function testStatusOkWithoutBuildIdExpectation() {
  const result = evaluateReadinessResponse({
    httpStatus: 200,
    body: okBody("any-build"),
  });

  assert(result.ready, "status ok should be enough without buildId expectation");
}

function testInvocationModeTreatsImporterAsLibrary() {
  const mode = resolveReadinessInvocationMode(process.argv[1]);
  assert(mode === "library", `unit test import must stay library, got ${mode}`);
}

function spawnReadiness(scriptPath, args, extra = {}) {
  return spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    timeout: 15000,
    ...extra,
  });
}

function assertNeverEmptySuccess(result, label) {
  const stdout = result.stdout ?? "";
  const empty = stdout.trim().length === 0;
  if (result.status === 0 && empty) {
    throw new Error(`${label}: EXIT=0 with empty stdout is forbidden`);
  }
}

function parseStdoutJson(result, label) {
  const line = (result.stdout ?? "").trim().split("\n").pop() ?? "";
  assert(line.length > 0, `${label}: expected JSON on stdout`);
  const payload = JSON.parse(line);
  assert(typeof payload === "object" && payload !== null, `${label}: JSON object`);
  return payload;
}

function testCliViaPhysicalPathNeverEmptySuccess() {
  const result = spawnReadiness(readinessScript, [
    "probe",
    "--url",
    "http://127.0.0.1:1/api/health/build",
  ]);
  assertNeverEmptySuccess(result, "physical probe");
  assert(result.status !== 0, "unreachable probe must fail-closed");
  const payload = parseStdoutJson(result, "physical probe");
  assert(payload.ready === false, "physical probe must not be ready");
  assert(payload.reason, "physical probe must report a reason");
}

function testCliViaSymlinkPath() {
  const dir = join(tmpdir(), `audiolad-readiness-symlink-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const symlinkPath = join(dir, "readiness-check.mjs");
  symlinkSync(readinessScript, symlinkPath);

  const result = spawnReadiness(symlinkPath, [
    "probe",
    "--url",
    "http://127.0.0.1:1/api/health/build",
  ]);
  assertNeverEmptySuccess(result, "symlink probe");
  assert(result.status !== 0, "symlink probe of a closed port must fail-closed");
  const payload = parseStdoutJson(result, "symlink probe");
  assert(payload.ready === false, "symlink probe must not be ready");
  assert(
    payload.reason !== "unknown" && payload.reason !== "cli_detection_failed",
    `symlink probe must run CLI, reason=${payload.reason}`,
  );
}

function testMissingCommandNeverEmptySuccess() {
  const physical = spawnReadiness(readinessScript, []);
  assertNeverEmptySuccess(physical, "physical missing command");
  assert(physical.status !== 0, "missing command must be non-zero");

  const dir = join(tmpdir(), `audiolad-readiness-symlink-nocmd-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const symlinkPath = join(dir, "readiness-check.mjs");
  symlinkSync(readinessScript, symlinkPath);
  const linked = spawnReadiness(symlinkPath, []);
  assertNeverEmptySuccess(linked, "symlink missing command");
  assert(linked.status !== 0, "symlink missing command must be non-zero");
}

function main() {
  test502RecoverySequence();
  testPermanent502Timeout();
  testWrongBuildIdKeepsWaiting();
  testMatchingBuildIdReady();
  testStatusOkWithoutBuildIdExpectation();
  testInvocationModeTreatsImporterAsLibrary();
  testCliViaPhysicalPathNeverEmptySuccess();
  testCliViaSymlinkPath();
  testMissingCommandNeverEmptySuccess();
  console.log("readiness-check-unit: all tests passed");
}

main();
