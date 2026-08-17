import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createStudioProject } from "../src/lib/studio/persistence-client";

const authorId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const originalFetch = globalThis.fetch;
let requestCount = 0;

try {
  globalThis.fetch = async (input, init) => {
    requestCount += 1;
    assert.equal(input, "/api/studio/projects");
    assert.equal(init?.method, "POST");
    assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(init?.body)), {
      authorId,
      name: "Новый проект",
    });
    return Response.json({
      project: {
        id: projectId,
        name: "Новый проект",
        projectData: {},
        revision: 1,
      },
    }, { status: 201 });
  };

  const project = await createStudioProject({ authorId, name: "Новый проект" });
  assert.equal(requestCount, 1);
  assert.equal(project.id, projectId);
} finally {
  globalThis.fetch = originalFetch;
}

const newProjectPage = await readFile(
  new URL("../src/app/(studio)/studio/project/new/page.tsx", import.meta.url),
  "utf8",
);
assert.match(newProjectPage, /requireStudioEditorAccess\("\/studio\/project\/new"\)/);
assert.match(newProjectPage, /authorId=\{authorId\}/);
assert.match(newProjectPage, /accessMode=\{accessMode\}/);
assert.match(newProjectPage, /studioRecorderDebug === "1"/);

const creator = await readFile(
  new URL("../src/components/studio/StudioProjectCreator.tsx", import.meta.url),
  "utf8",
);
assert.match(creator, /creationPromiseRef/);
assert.match(creator, /projectIdRef/);
assert.match(creator, /router\.replace/);
assert.match(creator, /Повторить/);
assert.match(creator, /\?studioRecorderDebug=1/);

const persistedPage = await readFile(
  new URL("../src/app/(studio)/studio/project/[projectId]/page.tsx", import.meta.url),
  "utf8",
);
assert.match(persistedPage, /studioRecorderDebug === "1"/);
assert.match(persistedPage, /recorderDebug=\{studioRecorderDebug === "1"\}/);

const editor = await readFile(
  new URL("../src/components/studio/StudioEditorShell.tsx", import.meta.url),
  "utf8",
);
assert.match(editor, /recorderDebug = false/);
assert.match(editor, /\{recorderDebug \?/);
assert.match(editor, /Отладка записи/);
assert.match(editor, /\{recordingStatus\}/);
assert.match(editor, /\{recordingSlotId \?\? "—"\}/);
assert.match(editor, /\{formatTime\(recordingElapsed\)\}/);

console.log("studio-project-creation-unit: ok");
