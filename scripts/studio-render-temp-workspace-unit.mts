import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  STUDIO_RENDER_MIN_FREE_BYTES,
  STUDIO_RENDER_TEMP_OWNER_FILE,
  STUDIO_RENDER_TEMP_PREFIX,
  STUDIO_RENDER_TEMP_STALE_TTL_MS,
  StudioRenderDiskSpaceError,
  assertScopedStudioRenderTempPath,
  assertStudioRenderDiskSpace,
  createStudioRenderTempWorkspace,
  estimateStudioRenderOutputBytes,
  isStudioRenderTempDirName,
  removeStudioRenderTempWorkspace,
  requiredStudioRenderFreeBytes,
  sweepStaleStudioRenderTempDirs,
} from "../src/lib/studio/render/temp-workspace";
import {
  executeClaimedStudioRenderJob,
} from "../src/lib/studio/render/worker-runtime";
import type { ClaimedStudioRenderJob } from "../src/lib/studio/render/worker";
import type { StudioRenderSnapshot } from "../src/lib/studio/render/types";

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "audiolad-temp-sweep-root-"));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function emptySnapshot(): StudioRenderSnapshot {
  return {
    project: {
      id: "project",
      revision: 1,
      name: "Test",
      schemaVersion: 2,
      studioVersion: 1,
    },
    tracks: [],
    assets: [],
  };
}

function claimedJob(id = "job-1"): ClaimedStudioRenderJob {
  return {
    id,
    project_id: "project",
    guest_session_id: null,
    lease_token: "token-1",
    project_snapshot: emptySnapshot(),
  };
}

async function main() {
  assert.equal(isStudioRenderTempDirName("audiolad-render-0ea7f206-b0b4-4828-ac9e-a98991547d1a"), true);
  assert.equal(isStudioRenderTempDirName("audiolad-render-test-abc"), false);
  assert.equal(isStudioRenderTempDirName("audiolad-studio-job-1-xyz"), false);
  assert.equal(isStudioRenderTempDirName("other-prefix-0ea7f206-b0b4-4828-ac9e-a98991547d1a"), false);

  // 3h at 192 kbps ≈ 259.2 MB
  const threeHourBytes = estimateStudioRenderOutputBytes(3 * 3600);
  assert.equal(threeHourBytes, Math.ceil((3 * 3600 * 192_000) / 8));
  assert.ok(threeHourBytes < 300 * 1024 * 1024);
  assert.ok(requiredStudioRenderFreeBytes(3 * 3600) >= STUDIO_RENDER_MIN_FREE_BYTES);

  await assert.rejects(
    () => assertStudioRenderDiskSpace({ durationSeconds: 60, nowFreeBytes: 1024 }),
    (error: unknown) => {
      assert.ok(error instanceof StudioRenderDiskSpaceError);
      assert.equal(error.code, "studio_render_disk_space");
      assert.ok(error.requiredBytes >= STUDIO_RENDER_MIN_FREE_BYTES);
      return true;
    },
  );
  const ok = await assertStudioRenderDiskSpace({
    durationSeconds: 60,
    nowFreeBytes: STUDIO_RENDER_MIN_FREE_BYTES * 2,
  });
  assert.ok(ok.freeBytes >= ok.requiredBytes);

  await withTempRoot(async (root) => {
    const workspace = await createStudioRenderTempWorkspace({
      root,
      jobId: "job-success",
      pid: process.pid,
      nowMs: 1_000,
    });
    assert.ok(isStudioRenderTempDirName(workspace.split("/").pop()!));
    await writeFile(join(workspace, "job-success.mp3"), Buffer.alloc(32, 7));
    await removeStudioRenderTempWorkspace(workspace, root);
    const left = await readdir(root);
    assert.deepEqual(left, []);
  });

  await withTempRoot(async (root) => {
    const workspace = await createStudioRenderTempWorkspace({
      root,
      jobId: "job-fail",
      pid: 1,
      nowMs: 1_000,
    });
    await writeFile(join(workspace, "job-fail.mp3"), Buffer.alloc(16, 3));
    await assert.rejects(async () => {
      try {
        throw new Error("ffmpeg exited with 1: boom");
      } finally {
        await removeStudioRenderTempWorkspace(workspace, root);
      }
    }, /ffmpeg exited/);
    assert.deepEqual(await readdir(root), []);
  });

  await withTempRoot(async (root) => {
    const foreign = join(root, "not-our-temp-dir");
    const lookalike = join(root, "audiolad-render-test-not-uuid");
    await mkdir(foreign);
    await mkdir(lookalike);
    await writeFile(join(foreign, "keep.txt"), "keep");
    await writeFile(join(lookalike, "keep.txt"), "keep");
    assert.throws(() => assertScopedStudioRenderTempPath(foreign, root));
    await assert.rejects(
      () => removeStudioRenderTempWorkspace(foreign, root),
      /refusing to touch/,
    );
    await assert.rejects(
      () => removeStudioRenderTempWorkspace(lookalike, root),
      /refusing to touch/,
    );
    const sweep = await sweepStaleStudioRenderTempDirs({
      root,
      nowMs: Date.now() + STUDIO_RENDER_TEMP_STALE_TTL_MS * 2,
      isAlive: () => false,
    });
    assert.deepEqual(sweep.removed, []);
    assert.ok(sweep.skippedForeign.includes("audiolad-render-test-not-uuid"));
    assert.deepEqual(await readdir(foreign), ["keep.txt"]);
    assert.deepEqual(await readdir(lookalike), ["keep.txt"]);
  });

  await withTempRoot(async (root) => {
    const alive = await createStudioRenderTempWorkspace({
      root,
      jobId: "active",
      pid: 4242,
      nowMs: 10,
    });
    const freshOrphan = await createStudioRenderTempWorkspace({
      root,
      jobId: "fresh",
      pid: 999_999_999,
      nowMs: 1_000_000,
    });
    const staleOrphan = await createStudioRenderTempWorkspace({
      root,
      jobId: "stale",
      pid: 888_888_888,
      nowMs: 1,
    });
    const nowMs = 1 + STUDIO_RENDER_TEMP_STALE_TTL_MS + 5_000;
    const sweep = await sweepStaleStudioRenderTempDirs({
      root,
      nowMs,
      isAlive: (pid) => pid === 4242,
    });
    assert.ok(sweep.skippedActive.includes(alive.split("/").pop()!));
    assert.ok(sweep.skippedFresh.includes(freshOrphan.split("/").pop()!));
    assert.ok(sweep.removed.includes(staleOrphan.split("/").pop()!));
    const remaining = new Set(await readdir(root));
    assert.ok(remaining.has(alive.split("/").pop()!));
    assert.ok(remaining.has(freshOrphan.split("/").pop()!));
    assert.equal(remaining.has(staleOrphan.split("/").pop()!), false);
  });

  // executeClaimedStudioRenderJob: cleanup after success
  {
    const created: string[] = [];
    const removed: string[] = [];
    const root = await mkdtemp(join(tmpdir(), "audiolad-exec-success-"));
    try {
      const result = await executeClaimedStudioRenderJob(
        {} as never,
        claimedJob("job-success"),
        new AbortController().signal,
        1800,
        {
          sweepStale: async () => ({
            scanned: 0,
            removed: [],
            skippedActive: [],
            skippedFresh: [],
            skippedForeign: [],
          }),
          assertDiskSpace: async () => ({
            freeBytes: STUDIO_RENDER_MIN_FREE_BYTES * 2,
            requiredBytes: STUDIO_RENDER_MIN_FREE_BYTES,
          }),
          createWorkspace: async ({ jobId } = {}) => {
            const workspace = await createStudioRenderTempWorkspace({ root, jobId });
            created.push(workspace);
            return workspace;
          },
          removeWorkspace: async (workspace) => {
            removed.push(workspace);
            await removeStudioRenderTempWorkspace(workspace, root);
          },
          renderToMp3: async (_input, options) => {
            const outputPath = join(options.outputDirectory, `${options.renderId}.mp3`);
            await writeFile(outputPath, Buffer.alloc(64, 1));
            return {
              outputPath,
              durationSeconds: 1,
              expectedDurationSeconds: 1,
              actualDurationSeconds: 1,
              durationDeltaSeconds: 0,
              sizeBytes: 64,
              stderr: "ok",
            };
          },
        },
      );
      // upload will fail without supabase — expect failure path still cleans
      assert.equal(created.length, 1);
      assert.equal(removed.length, 1);
      assert.deepEqual(await readdir(root), []);
      void result;
    } catch (error) {
      assert.equal(created.length, 1);
      assert.equal(removed.length, 1);
      assert.deepEqual(await readdir(root), []);
      assert.ok(error);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  // executeClaimedStudioRenderJob: cleanup after render exception
  {
    const created: string[] = [];
    const removed: string[] = [];
    const root = await mkdtemp(join(tmpdir(), "audiolad-exec-fail-"));
    try {
      await assert.rejects(
        () => executeClaimedStudioRenderJob(
          {} as never,
          claimedJob("job-fail"),
          new AbortController().signal,
          1800,
          {
            sweepStale: async () => ({
              scanned: 0,
              removed: [],
              skippedActive: [],
              skippedFresh: [],
              skippedForeign: [],
            }),
            assertDiskSpace: async () => ({
              freeBytes: STUDIO_RENDER_MIN_FREE_BYTES * 2,
              requiredBytes: STUDIO_RENDER_MIN_FREE_BYTES,
            }),
            createWorkspace: async ({ jobId } = {}) => {
              const workspace = await createStudioRenderTempWorkspace({ root, jobId });
              created.push(workspace);
              return workspace;
            },
            removeWorkspace: async (workspace) => {
              removed.push(workspace);
              await removeStudioRenderTempWorkspace(workspace, root);
            },
            renderToMp3: async () => {
              throw new Error("ffmpeg exited with 1: synthetic failure");
            },
          },
        ),
        /ffmpeg exited/,
      );
      assert.equal(created.length, 1);
      assert.equal(removed.length, 1);
      assert.deepEqual(await readdir(root), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  // disk-space guard aborts before workspace creation
  {
    let created = 0;
    await assert.rejects(
      () => executeClaimedStudioRenderJob(
        {} as never,
        claimedJob("job-disk"),
        new AbortController().signal,
        1800,
        {
          sweepStale: async () => ({
            scanned: 0,
            removed: [],
            skippedActive: [],
            skippedFresh: [],
            skippedForeign: [],
          }),
          assertDiskSpace: async () => {
            throw new StudioRenderDiskSpaceError(100, STUDIO_RENDER_MIN_FREE_BYTES);
          },
          createWorkspace: async () => {
            created += 1;
            throw new Error("should not create workspace");
          },
          renderToMp3: async () => {
            throw new Error("should not render");
          },
        },
      ),
      (error: unknown) => error instanceof StudioRenderDiskSpaceError,
    );
    assert.equal(created, 0);
  }

  // owner marker format
  await withTempRoot(async (root) => {
    const workspace = await createStudioRenderTempWorkspace({
      root,
      jobId: "job-owner",
      pid: 123,
      nowMs: 42,
    });
    const raw = await readFile(join(workspace, STUDIO_RENDER_TEMP_OWNER_FILE), "utf8");
    assert.deepEqual(JSON.parse(raw), { pid: 123, startedAtMs: 42, jobId: "job-owner" });
    assert.ok(workspace.includes(STUDIO_RENDER_TEMP_PREFIX));
  });

  console.log("studio-render-temp-workspace-unit: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
