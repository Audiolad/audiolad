#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const helpRoute = read("src/app/(studio)/studio/help/page.tsx");
const helpClient = read("src/components/studio/StudioHelpClient.tsx");
const studioEntry = read("src/app/(studio)/studio/page.tsx");
const projectsEntry = read("src/app/(studio)/studio/projects/page.tsx");
const editor = read("src/components/studio/StudioEditorShell.tsx");

assert.match(helpRoute, /requireStudioAuthorAccess\("\/studio\/help"\)/);
assert.match(helpRoute, /index: false/);
assert.match(helpRoute, /follow: false/);
assert.match(helpClient, /Найти в инструкции/);
assert.match(helpClient, /Ничего не найдено\. Попробуйте другой запрос\./);
assert.match(helpClient, /Быстрый старт/);
assert.match(helpClient, /Создать MP3/);
assert.match(helpClient, /Скачать MP3/);
assert.match(helpClient, /Частые вопросы/);
assert.match(helpClient, /Короткая памятка/);

for (const source of [studioEntry, projectsEntry, editor]) {
  assert.match(source, /href="\/studio\/help"/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /noopener noreferrer/);
}

console.log("studio-help-unit: ok");
