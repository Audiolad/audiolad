import assert from "node:assert/strict";

import {
  resolveStudioProjectAccess,
  selectDownloadableStudioRenderJob,
} from "../src/lib/studio/guest-policy";

const authorA = "11111111-1111-4111-8111-111111111111";
const authorB = "22222222-2222-4222-8222-222222222222";
const guestA = "33333333-3333-4333-8333-333333333333";
const guestB = "44444444-4444-4444-8444-444444444444";
const projectA = "55555555-5555-4555-8555-555555555555";
const projectB = "66666666-6666-4666-8666-666666666666";
const authorProject = "77777777-7777-4777-8777-777777777777";

const guestProjectA = {
  id: projectA,
  status: "active",
  author_id: null,
  guest_session_id: guestA,
};
const guestProjectB = {
  id: projectB,
  status: "active",
  author_id: null,
  guest_session_id: guestB,
};
const ownedAuthorProject = {
  id: authorProject,
  status: "active",
  author_id: authorA,
  guest_session_id: null,
};

assert.equal(
  resolveStudioProjectAccess({
    project: guestProjectA,
    actor: { kind: "guest", sessionId: guestB },
  }).ok,
  false,
);
assert.equal(
  resolveStudioProjectAccess({
    project: guestProjectB,
    actor: { kind: "guest", sessionId: guestA },
  }).ok,
  false,
);
assert.equal(
  resolveStudioProjectAccess({
    project: ownedAuthorProject,
    actor: { kind: "guest", sessionId: guestA },
  }).ok,
  false,
);
assert.equal(
  resolveStudioProjectAccess({
    project: guestProjectA,
    actor: { kind: "author", authorIds: [authorA] },
  }).ok,
  false,
);
assert.equal(
  resolveStudioProjectAccess({
    project: ownedAuthorProject,
    actor: { kind: "author", authorIds: [authorB] },
  }).ok,
  false,
);
assert.equal(
  resolveStudioProjectAccess({
    project: ownedAuthorProject,
    actor: { kind: "none" },
  }).ok,
  false,
);
assert.equal(
  resolveStudioProjectAccess({
    project: guestProjectA,
    actor: { kind: "none" },
  }).ok,
  false,
);
assert.equal(
  resolveStudioProjectAccess({
    project: { ...guestProjectA, status: "deleted" },
    actor: { kind: "guest", sessionId: guestA },
  }).ok,
  false,
);

const guestOk = resolveStudioProjectAccess({
  project: guestProjectA,
  actor: { kind: "guest", sessionId: guestA },
});
assert.equal(guestOk.ok, true);
if (guestOk.ok) {
  assert.equal(guestOk.ownerKind, "guest");
  assert.equal(guestOk.ownerId, guestA);
  assert.equal(guestOk.authorId, null);
}

const authorOk = resolveStudioProjectAccess({
  project: ownedAuthorProject,
  actor: { kind: "author", authorIds: [authorA] },
});
assert.equal(authorOk.ok, true);
if (authorOk.ok) {
  assert.equal(authorOk.ownerKind, "author");
  assert.equal(authorOk.ownerId, authorA);
}

assert.equal(
  selectDownloadableStudioRenderJob({
    projectId: projectA,
    currentRevision: 2,
    currentRevisionJob: {
      id: "job-other",
      project_id: projectB,
      project_revision: 2,
      status: "completed",
      output_storage_path: "jobs/other/file.mp3",
    },
    entitledJob: null,
  }),
  null,
);

assert.equal(
  selectDownloadableStudioRenderJob({
    projectId: projectA,
    currentRevision: 2,
    currentRevisionJob: null,
    entitledJob: {
      id: "job-other",
      project_id: projectB,
      project_revision: 1,
      status: "completed",
      output_storage_path: "jobs/other/file.mp3",
    },
  }),
  null,
);

console.log("studio-guest-security-unit: ok");
