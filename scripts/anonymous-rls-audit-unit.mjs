// Static declaration inventory, not a SQL interpreter or effective ACL audit.
// Tracks policies, function grants, client table grants and default privileges.
// Function bodies, revokes and dynamic SQL are outside this check.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = ["baseline", "migrations"].flatMap((dir) =>
  readdirSync(resolve(root, "supabase", dir)).filter((name) => name.endsWith(".sql")).sort()
    .map((name) => `supabase/${dir}/${name}`));
const inventory = [];
for (const file of files) {
  const sql = readFileSync(resolve(root, file), "utf8").replace(/--[^\n]*/g, "");
  for (const [kind, regex] of [
    ["policy", /\bCREATE\s+POLICY\s+("[^"]+"|[\w]+)\s+ON\s+([\w.]+)[\s\S]*?;/gi],
    ["table", /\bGRANT\s+[^;]+?\s+ON\s+(?:TABLE\s+|ALL\s+TABLES\s+IN\s+SCHEMA\s+|(?=[\w".]+\s*(?:,|TO\b)))[\s\S]*?;/gi],
    ["default_privileges", /\bALTER\s+DEFAULT\s+PRIVILEGES\b[\s\S]*?;/gi],
    ["execute", /\bGRANT\s+(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+(?:FUNCTION|ALL\s+FUNCTIONS\s+IN\s+SCHEMA)\s+[\s\S]*?;/gi],
  ]) {
    for (const match of sql.matchAll(regex)) {
      const statement = match[0].replace(/\s+/g, " ").trim();
      if (kind === "table") {
        const grantees = (statement.match(/\bTO\s+([^;]+)/i)?.[1] ?? "")
          .replace(/\s+WITH\s+GRANT\s+OPTION\b.*$/i, "");
        if (!grantees.split(",").some((role) =>
          /^(?:anon|authenticated|public)$/i.test(role.trim().replace(/^"|"$/g, "")))) continue;
      }
      inventory.push({ file, kind, statement });
    }
  }
}
const actual = { inventory };
const snapshotUrl = new URL("./fixtures/anonymous-rls-audit.snapshot.json", import.meta.url);
// After reviewing anonymous exposure of a new migration, refresh explicitly:
// ANONYMOUS_RLS_AUDIT_UPDATE=1 node scripts/anonymous-rls-audit-unit.mjs
if (process.env.ANONYMOUS_RLS_AUDIT_UPDATE === "1") {
  writeFileSync(snapshotUrl, `${JSON.stringify(actual, null, 2)}\n`);
  console.log("anonymous-rls-audit: snapshot updated");
}
const expected = JSON.parse(readFileSync(snapshotUrl, "utf8"));
assert.deepEqual(actual, expected, "SQL access surface changed. Review anonymous exposure and update the stage 1 risk table and snapshot explicitly.");
assert.ok(inventory.some((row) => row.kind === "execute" && /authenticated/i.test(row.statement)));
assert.ok(inventory.some((row) => row.kind === "policy"));
console.log(`anonymous-rls-audit: ${inventory.length} policy/grant declarations reviewed (historical declarations retained)`);
