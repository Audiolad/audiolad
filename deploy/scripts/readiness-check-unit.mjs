#!/usr/bin/env node

import { evaluateReadinessResponse } from "./lib/readiness-check.mjs";

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

function main() {
  test502RecoverySequence();
  testPermanent502Timeout();
  testWrongBuildIdKeepsWaiting();
  testMatchingBuildIdReady();
  testStatusOkWithoutBuildIdExpectation();
  console.log("readiness-check-unit: all tests passed");
}

main();
