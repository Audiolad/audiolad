import assert from "node:assert/strict";

import {
  STUDIO_GUEST_MAX_PROJECTS,
  canCreateGuestProject,
  evaluateGuestRenderCreate,
  guestRenderEntitlementConsumed,
  planGuestSessionCleanup,
  selectDownloadableStudioRenderJob,
  shouldConsumeGuestRenderOnSuccess,
} from "../src/lib/studio/guest-policy";

assert.equal(STUDIO_GUEST_MAX_PROJECTS, 3);
assert.equal(canCreateGuestProject(0), true);
assert.equal(canCreateGuestProject(1), true);
assert.equal(canCreateGuestProject(2), true);
assert.equal(canCreateGuestProject(3), false);
assert.equal(canCreateGuestProject(4), false);

let active = 0;
const created: number[] = [];
for (let index = 0; index < 5; index += 1) {
  if (!canCreateGuestProject(active)) break;
  active += 1;
  created.push(index);
}
assert.deepEqual(created, [0, 1, 2]);
active -= 1;
assert.equal(canCreateGuestProject(active), true);

const session = { free_render_consumed_at: null as string | null };
assert.equal(guestRenderEntitlementConsumed(session), false);
assert.deepEqual(
  evaluateGuestRenderCreate({ consumed: false, hasActiveJob: false, rateLimited: false }),
  { ok: true },
);
assert.equal(shouldConsumeGuestRenderOnSuccess({ guest_session_id: "g", status: "failed" }), false);
assert.equal(shouldConsumeGuestRenderOnSuccess({ guest_session_id: "g", status: "completed" }), true);
assert.equal(shouldConsumeGuestRenderOnSuccess({ guest_session_id: null, status: "completed" }), false);

session.free_render_consumed_at = "2026-08-17T12:00:00.000Z";
assert.equal(guestRenderEntitlementConsumed(session), true);
assert.deepEqual(
  evaluateGuestRenderCreate({ consumed: true, hasActiveJob: false, rateLimited: false }),
  { ok: false, error: "guest_render_entitlement" },
);
assert.deepEqual(
  evaluateGuestRenderCreate({ consumed: false, hasActiveJob: true, rateLimited: false }),
  { ok: false, error: "render_already_queued" },
);
assert.deepEqual(
  evaluateGuestRenderCreate({ consumed: false, hasActiveJob: false, rateLimited: true }),
  { ok: false, error: "rate_limited" },
);

const projectId = "55555555-5555-4555-8555-555555555555";
const entitled = {
  id: "job-1",
  project_id: projectId,
  project_revision: 1,
  status: "completed",
  output_storage_path: "jobs/job-1/out.mp3",
};
assert.equal(
  selectDownloadableStudioRenderJob({
    projectId,
    currentRevision: 3,
    currentRevisionJob: {
      id: "job-2",
      project_id: projectId,
      project_revision: 3,
      status: "failed",
      output_storage_path: null,
    },
    entitledJob: entitled,
  })?.id,
  "job-1",
);
assert.equal(
  selectDownloadableStudioRenderJob({
    projectId,
    currentRevision: 1,
    currentRevisionJob: entitled,
    entitledJob: entitled,
  })?.id,
  "job-1",
);
assert.equal(
  selectDownloadableStudioRenderJob({
    projectId: "66666666-6666-4666-8666-666666666666",
    currentRevision: 1,
    currentRevisionJob: null,
    entitledJob: entitled,
  }),
  null,
);

const now = new Date("2026-08-18T00:00:00.000Z");
const expiredId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const activeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const authorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const expiredProject = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const authorProject = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const first = planGuestSessionCleanup({
  now,
  sessions: [
    { id: expiredId, expires_at: "2026-08-17T00:00:00.000Z" },
    { id: activeId, expires_at: "2026-08-20T00:00:00.000Z" },
  ],
  projects: [
    { id: expiredProject, author_id: null, guest_session_id: expiredId },
    { id: authorProject, author_id: authorId, guest_session_id: null },
  ],
  assets: [
    { id: "asset-1", project_id: expiredProject, storage_path: `studio/guest/${expiredId}/${expiredProject}/asset-1/a.mp3` },
    { id: "asset-author", project_id: authorProject, storage_path: `studio/${authorId}/${authorProject}/asset-author/a.mp3` },
  ],
  jobs: [
    {
      id: "job-expired",
      project_id: expiredProject,
      author_id: null,
      guest_session_id: expiredId,
      output_storage_path: "jobs/job-expired/out.mp3",
    },
    {
      id: "job-author",
      project_id: authorProject,
      author_id: authorId,
      guest_session_id: null,
      output_storage_path: "jobs/job-author/out.mp3",
    },
  ],
});
assert.deepEqual(first.sessionIds, [expiredId]);
assert.deepEqual(first.projectIds, [expiredProject]);
assert.deepEqual(first.assetIds, ["asset-1"]);
assert.deepEqual(first.jobIds, ["job-expired"]);
assert.ok(!first.storagePaths.some((path) => path.includes(authorId)));
assert.ok(!first.projectIds.includes(authorProject));

const second = planGuestSessionCleanup({
  now,
  sessions: [],
  projects: [{ id: authorProject, author_id: authorId, guest_session_id: null }],
  assets: [{ id: "asset-author", project_id: authorProject, storage_path: `studio/${authorId}/${authorProject}/asset-author/a.mp3` }],
  jobs: [{
    id: "job-author",
    project_id: authorProject,
    author_id: authorId,
    guest_session_id: null,
    output_storage_path: "jobs/job-author/out.mp3",
  }],
});
assert.deepEqual(second, {
  sessionIds: [],
  projectIds: [],
  assetIds: [],
  jobIds: [],
  storagePaths: [],
});

console.log("studio-guest-limits-unit: ok");
