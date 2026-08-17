#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const helpRoute = read("src/app/(studio)/studio/help/page.tsx");
const helpClient = read("src/components/studio/StudioHelpClient.tsx");
const studioEntry = read("src/app/(studio)/studio/page.tsx");
const projectsEntry = read("src/app/(studio)/studio/projects/page.tsx");
const chromeNav = read("src/components/studio/StudioChromeNav.tsx");
const editor = read("src/components/studio/StudioEditorShell.tsx");

assert.match(helpRoute, /requireStudioEditorAccess\("\/studio\/help"\)/);
assert.match(helpRoute, /index: false/);
assert.match(helpRoute, /follow: false/);
assert.match(helpClient, /Найти в инструкции/);
assert.match(helpClient, /Ничего не найдено\. Попробуйте другой запрос\./);
assert.match(helpClient, /Быстрый старт/);
assert.match(helpClient, /Создать MP3/);
assert.match(helpClient, /Скачать MP3/);
assert.match(helpClient, /Частые вопросы/);
assert.match(helpClient, /Короткая памятка/);
assert.match(helpClient, /id: "copy-duplicate"/);
assert.match(helpClient, /Копирование, вставка и дублирование/);
assert.match(helpClient, /Дублировать дорожку/);
assert.match(helpClient, /плавный переход/);
assert.match(helpClient, /продлить музыку/);
assert.match(helpClient, /Cmd\+C/);
assert.match(helpClient, /Ctrl\+C/);
assert.match(helpClient, /Cmd\+V/);
assert.match(helpClient, /Ctrl\+V/);
assert.match(helpClient, /Cmd\+D/);
assert.match(helpClient, /Ctrl\+D/);
assert.match(helpClient, /faq-extend-music/);
assert.match(helpClient, /Как быстро продлить короткую музыку на всю практику\?/);
assert.match(helpClient, /Дублировать — создаёт копию выбранного фрагмента сразу после него\./);
assert.match(helpClient, /\["Монтаж", sections\.slice\(11, 18\)\]/);

function searchable(source) {
  return source.toLocaleLowerCase("ru");
}
const helpText = searchable(helpClient);
for (const term of [
  "копировать",
  "копирование",
  "вставить",
  "вставка",
  "дублировать",
  "дублирование",
  "cmd+c",
  "ctrl+c",
  "cmd+v",
  "ctrl+v",
  "cmd+d",
  "ctrl+d",
  "продлить музыку",
  "плавный переход",
]) {
  assert.match(helpText, new RegExp(term.replace(/[+/]/g, "\\$&"), "i"));
}

assert.match(projectsEntry, /StudioChromeNav/);
for (const source of [studioEntry, chromeNav, editor]) {
  assert.match(source, /href="\/studio\/help"/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /noopener noreferrer/);
}

console.log("studio-help-unit: ok");
