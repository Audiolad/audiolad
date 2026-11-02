// Conservative static tripwire, not a SQL interpreter. Snapshot every source
// file as well as every policy/explicit EXECUTE grant. Function body changes,
// dynamic SQL, PUBLIC/default privileges and revokes cannot evade the tripwire.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = ["baseline", "migrations"].flatMap((dir) =>
  readdirSync(resolve(root, "supabase", dir)).filter((name) => name.endsWith(".sql")).sort()
    .map((name) => `supabase/${dir}/${name}`));
const sources = files.map((file) => ({ file, sha256: createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex") }));
const inventory = [];
for (const file of files) {
  const sql = readFileSync(resolve(root, file), "utf8").replace(/--[^\n]*/g, "");
  for (const [kind, regex] of [
    ["policy", /\bCREATE\s+POLICY\s+("[^"]+"|[\w]+)\s+ON\s+([\w.]+)[\s\S]*?;/gi],
    ["execute", /\bGRANT\s+(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+(?:FUNCTION|ALL\s+FUNCTIONS\s+IN\s+SCHEMA)\s+[\s\S]*?;/gi],
  ]) {
    for (const match of sql.matchAll(regex)) {
      const statement = match[0].replace(/\s+/g, " ").trim();
      inventory.push({ file, kind, statement });
    }
  }
}
const actual = { sources, inventory };
const snapshotUrl = new URL("./fixtures/anonymous-rls-audit.snapshot.json", import.meta.url);
// After reviewing anonymous exposure of a new migration, refresh explicitly:
// ANONYMOUS_RLS_AUDIT_UPDATE=1 npm run test:anonymous-rls-audit
if (process.env.ANONYMOUS_RLS_AUDIT_UPDATE === "1") {
  writeFileSync(snapshotUrl, `${JSON.stringify(actual, null, 2)}\n`);
  console.log("anonymous-rls-audit: snapshot updated");
}
const expected = JSON.parse(readFileSync(snapshotUrl, "utf8"));
assert.deepEqual(actual, expected, "SQL access surface changed. Review anonymous exposure and update the stage 1 risk table and snapshot explicitly.");
assert.ok(inventory.some((row) => row.kind === "execute" && /authenticated/i.test(row.statement)));
assert.ok(inventory.some((row) => row.kind === "policy"));
console.log(`anonymous-rls-audit: ${sources.length} SQL sources, ${inventory.length} policy/grant declarations reviewed (historical declarations retained)`);
