// АудиоСпринт «Вкус жизни» landing (Company Core eb792a06): static guards.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pagePath = "src/app/(platform)/(listener)/vkus-zhizni/page.tsx";
const layoutPath = "src/app/(platform)/(listener)/vkus-zhizni/layout.tsx";
assert.ok(existsSync(path.join(root, pagePath)));
assert.ok(existsSync(path.join(root, layoutPath)));
const page = readFileSync(path.join(root, pagePath), "utf8");

// Content rules: en dash only, no outgoing links, no seasonal autumn accent.
assert.doesNotMatch(page, /\u2014/, "em dash is not allowed");
assert.doesNotMatch(page, /https?:\/\//, "no outgoing links");
assert.doesNotMatch(page, /осен/i, "no autumn accent");
assert.doesNotMatch(page, /и практики/, "categories are exactly «Музыка» and «Медитации»");

// Approved hero and facts.
for (const text of [
  "Вкус жизни",
  "АудиоСпринт для авторов АудиоЛада",
  "14–29 ноября 2026 года",
  "У каждого момента жизни есть своё звучание",
  "Именно этому посвящён наш новый АудиоСпринт – «Вкус жизни».",
  "16 дней",
  "2 направления",
  "6 000 ₽",
  "3 000 ₽",
  "2 000 ₽",
  "1 000 ₽",
  "до пяти броней одновременно",
  "Каждая бронь действует семь дней",
  "Дата розыгрыша будет объявлена позже.",
  "Давайте вместе наполним жизнь красивым звучанием!",
  "АудиоЛад – пусть жизнь звучит красиво!",
]) {
  assert.ok(page.includes(text), `missing: ${text}`);
}

// No invented raffle date: the only date range on the page is the sprint window.
assert.doesNotMatch(page, /Розыгрыш – \d/);

// Topic list is not published before the owner approves it (Core 976eabbc).
assert.match(page, /Список готовится/);
assert.match(page, /data-sprint-queries="pending"/);
assert.doesNotMatch(page, /Забронировать/);
assert.doesNotMatch(page, /audio-sprints\//, "no link into the old sprint data");

// CTA points to the on-page query block.
assert.equal((page.match(/Выбрать поисковый запрос/g) ?? []).length, 1);
assert.match(page, /const QUERIES_ANCHOR = "#queries";/);
assert.match(page, /<Section id="queries"/);

// The October sprint landing is unchanged by this task.
try {
  const diff = execFileSync(
    "git",
    ["diff", "--name-only", "origin/main...HEAD", "--", "src/app/(platform)/(listener)/osen-zvuchit"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  assert.equal(diff.trim(), "");
} catch (error) {
  if (error instanceof assert.AssertionError) throw error;
}

console.log("audio-sprint-vkus-zhizni-unit: ok");
