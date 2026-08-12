import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { listStudioProjects } from "../src/lib/studio/persistence-client";

const authorId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = async (input, init) => {
    assert.equal(
      input,
      `/api/studio/projects?authorId=${encodeURIComponent(authorId)}`,
    );
    assert.equal(init?.method, undefined);
    return Response.json({
      projects: [{
        id: projectId,
        name: "Тихое утро",
        updatedAt: "2026-08-12T06:00:00.000Z",
        lastOpenedAt: null,
        revision: 1,
      }],
    });
  };

  assert.deepEqual(await listStudioProjects({ authorId }), [{
    id: projectId,
    name: "Тихое утро",
    updatedAt: "2026-08-12T06:00:00.000Z",
    lastOpenedAt: null,
    revision: 1,
  }]);
} finally {
  globalThis.fetch = originalFetch;
}

const library = await readFile(
  new URL("../src/components/studio/StudioProjectLibrary.tsx", import.meta.url),
  "utf8",
);
assert.match(library, /listStudioProjects\(\{ authorId, signal: controller\.signal \}\)/);
assert.match(library, /href="\/studio\/project\/new"/);
assert.match(library, /href=\{`\/studio\/project\/\$\{encodeURIComponent\(project\.id\)\}`\}/);
assert.match(library, /Студия аудиопрактик/);
assert.match(library, /\+ Новый проект/);
assert.match(library, /Мои проекты/);
assert.match(library, /Открыть/);
assert.match(library, /Загружаем проекты/);
assert.match(library, /У вас пока нет проектов/);
assert.match(library, /Создать первый проект/);
assert.match(library, /role="alert"/);

const studioProjectsPage = await readFile(
  new URL("../src/app/(studio)/studio/projects/page.tsx", import.meta.url),
  "utf8",
);
assert.match(studioProjectsPage, /requireStudioAuthorAccess\("\/studio\/projects"\)/);
assert.match(studioProjectsPage, /<StudioProjectLibrary authorId=\{workspace\.id\} \/>/);
assert.match(studioProjectsPage, /← В Studio/);
assert.match(studioProjectsPage, /href="\/studio"/);

const editor = await readFile(
  new URL("../src/components/studio/StudioEditorShell.tsx", import.meta.url),
  "utf8",
);
assert.match(editor, /← Мои проекты/);
assert.match(editor, /href="\/studio\/projects"/);

console.log("studio-project-library-unit: ok");
