import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  deleteStudioProject,
  StudioPersistenceClientError,
} from "../src/lib/studio/persistence-client";

const projectId = "22222222-2222-4222-8222-222222222222";
const originalFetch = globalThis.fetch;

try {
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    requests += 1;
    assert.equal(
      input,
      `/api/studio/projects/${projectId}?expectedRevision=7`,
    );
    assert.equal(init?.method, "DELETE");
    return new Response(null, { status: 204 });
  };

  await deleteStudioProject({ projectId, expectedRevision: 7 });
  assert.equal(requests, 1, "one confirmed deletion makes one DELETE request");

  globalThis.fetch = async () => Response.json(
    { error: "project_conflict" },
    { status: 409 },
  );
  await assert.rejects(
    deleteStudioProject({ projectId, expectedRevision: 7 }),
    (error: unknown) =>
      error instanceof StudioPersistenceClientError &&
      error.code === "revision_conflict",
  );
} finally {
  globalThis.fetch = originalFetch;
}

const library = await readFile(
  new URL("../src/components/studio/StudioProjectLibrary.tsx", import.meta.url),
  "utf8",
);
assert.match(library, /requestDelete/);
assert.match(library, /cancelDelete/);
assert.match(library, /confirmDelete/);
assert.match(library, /if \(!projectToDelete \|\| deletingProjectId\) return/);
assert.match(library, /setProjects\(\(items\) => items\?\.filter/);
assert.match(library, /Не удалось удалить проект/);

console.log("studio-project-delete-unit: ok");
