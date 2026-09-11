import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpath as realpathAsync } from "node:fs/promises";

import {
  captureStudioRenderBootRelease,
  compareStudioRenderRelease,
  formatStudioRenderReleaseMismatchLog,
  formatStudioRenderReleaseUnavailableLog,
  formatStudioRenderWorkerBootLog,
  resolveStudioRenderCurrentReleaseLink,
  STUDIO_RENDER_CURRENT_RELEASE_LINK_DEFAULT,
} from "../src/lib/studio/render/worker-release";

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

async function withReleaseFixture<T>(
  run: (paths: {
    root: string;
    releaseA: string;
    releaseB: string;
    current: string;
  }) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "audiolad-render-release-"));
  const releaseA = join(root, "releases", "a");
  const releaseB = join(root, "releases", "b");
  const current = join(root, "current");
  mkdirSync(releaseA, { recursive: true });
  mkdirSync(releaseB, { recursive: true });
  writeFileSync(join(releaseA, ".deploy-commit"), `${SHA_A}\n`);
  writeFileSync(join(releaseB, ".deploy-commit"), `${SHA_B}\n`);
  symlinkSync(releaseA, current);
  try {
    return await run({ root, releaseA, releaseB, current });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testCurrentWhenSymlinkPointsAtBootRelease() {
  await withReleaseFixture(async ({ releaseA, current }) => {
    const boot = await captureStudioRenderBootRelease(releaseA);
    const comparison = await compareStudioRenderRelease({
      boot,
      currentLinkPath: current,
    });
    const expected = await realpathAsync(releaseA);
    assert.equal(comparison.state, "CURRENT");
    assert.equal(comparison.bootReleasePath, expected);
    assert.equal(comparison.currentReleasePath, expected);
    assert.equal(comparison.bootSha, SHA_A);
    assert.equal(comparison.currentSha, SHA_A);
    assert.notEqual(comparison.bootReleasePath, current);
  });
}

async function testBootFromSymlinkResolvesRealpath() {
  await withReleaseFixture(async ({ releaseA, current }) => {
    const boot = await captureStudioRenderBootRelease(current);
    const comparison = await compareStudioRenderRelease({
      boot,
      currentLinkPath: current,
    });
    assert.equal(comparison.state, "CURRENT");
    assert.equal(comparison.bootReleasePath, await realpathAsync(releaseA));
  });
}

async function testStaleWhenSymlinkSwitchesToOtherRelease() {
  await withReleaseFixture(async ({ releaseA, releaseB, current }) => {
    const boot = await captureStudioRenderBootRelease(releaseA);
    unlinkSync(current);
    symlinkSync(releaseB, current);
    const comparison = await compareStudioRenderRelease({
      boot,
      currentLinkPath: current,
    });
    assert.equal(comparison.state, "STALE");
    assert.equal(comparison.bootReleasePath, await realpathAsync(releaseA));
    assert.equal(comparison.currentReleasePath, await realpathAsync(releaseB));
    assert.equal(comparison.bootSha, SHA_A);
    assert.equal(comparison.currentSha, SHA_B);
    const mismatch = JSON.parse(formatStudioRenderReleaseMismatchLog(comparison));
    assert.equal(mismatch.event, "studio_render_release_mismatch");
    assert.equal(mismatch.bootSha, SHA_A);
    assert.equal(mismatch.currentSha, SHA_B);
  });
}

async function testMissingCurrentIsUnknown() {
  await withReleaseFixture(async ({ releaseA, current }) => {
    const boot = await captureStudioRenderBootRelease(releaseA);
    unlinkSync(current);
    const comparison = await compareStudioRenderRelease({
      boot,
      currentLinkPath: current,
    });
    assert.equal(comparison.state, "UNKNOWN");
    assert.equal(comparison.currentReleasePath, null);
    assert.equal(comparison.currentSha, null);
    assert.equal(comparison.reason, "release_path_unreadable");
  });
}

async function testDanglingCurrentSymlinkIsUnknown() {
  await withReleaseFixture(async ({ root, releaseA, current }) => {
    const boot = await captureStudioRenderBootRelease(releaseA);
    unlinkSync(current);
    symlinkSync(join(root, "missing-release"), current);
    const comparison = await compareStudioRenderRelease({
      boot,
      currentLinkPath: current,
    });
    assert.equal(comparison.state, "UNKNOWN");
    assert.equal(comparison.reason, "release_path_unreadable");
    const unavailable = JSON.parse(
      formatStudioRenderReleaseUnavailableLog(comparison.reason ?? ""),
    );
    assert.equal(unavailable.event, "studio_render_release_guard_unavailable");
    assert.equal(unavailable.reason, "release_path_unreadable");
  });
}

async function testUnreadableBootIsUnknown() {
  const comparison = await compareStudioRenderRelease({
    boot: { path: null, sha: null },
    currentLinkPath: "/tmp",
  });
  assert.equal(comparison.state, "UNKNOWN");
  assert.equal(comparison.reason, "boot_identity_unreadable");
}

async function testMissingShaStillCurrentWhenPathsMatch() {
  await withReleaseFixture(async ({ releaseA, current }) => {
    unlinkSync(join(releaseA, ".deploy-commit"));
    const boot = await captureStudioRenderBootRelease(releaseA);
    const comparison = await compareStudioRenderRelease({
      boot,
      currentLinkPath: current,
    });
    assert.equal(comparison.state, "CURRENT");
    assert.equal(comparison.bootSha, null);
    assert.equal(comparison.currentSha, null);
  });
}

async function testEnvOverrideForCurrentLink() {
  await withReleaseFixture(async ({ releaseA, current }) => {
    const boot = await captureStudioRenderBootRelease(releaseA);
    const comparison = await compareStudioRenderRelease({
      boot,
      env: { STUDIO_RENDER_CURRENT_RELEASE_LINK: current },
    });
    assert.equal(comparison.state, "CURRENT");
    assert.equal(
      resolveStudioRenderCurrentReleaseLink({}),
      STUDIO_RENDER_CURRENT_RELEASE_LINK_DEFAULT,
    );
    assert.equal(
      resolveStudioRenderCurrentReleaseLink({
        STUDIO_RENDER_CURRENT_RELEASE_LINK: current,
      }),
      current,
    );
  });
}

function testBootLogShape() {
  const line = formatStudioRenderWorkerBootLog({
    state: "CURRENT",
    bootReleasePath: "/releases/a",
    bootSha: SHA_A,
    currentReleasePath: "/releases/a",
    currentSha: SHA_A,
  });
  assert.deepEqual(JSON.parse(line), {
    event: "studio_render_worker_boot",
    bootReleasePath: "/releases/a",
    bootSha: SHA_A,
    currentReleasePath: "/releases/a",
    currentSha: SHA_A,
    releaseState: "CURRENT",
  });
}

async function main() {
  await testCurrentWhenSymlinkPointsAtBootRelease();
  await testBootFromSymlinkResolvesRealpath();
  await testStaleWhenSymlinkSwitchesToOtherRelease();
  await testMissingCurrentIsUnknown();
  await testDanglingCurrentSymlinkIsUnknown();
  await testUnreadableBootIsUnknown();
  await testMissingShaStillCurrentWhenPathsMatch();
  await testEnvOverrideForCurrentLink();
  testBootLogShape();
  console.log("studio-render-worker-release-unit: PASS");
}

await main();
