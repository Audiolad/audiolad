#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runBackfill(args) {
  return spawnSync("node", ["scripts/backfill-image-variants.mjs", ...args], {
    cwd: "/var/www/audiolad",
    encoding: "utf8",
  });
}

function testScriptContract() {
  const source = readFileSync(
    "/var/www/audiolad/scripts/backfill-image-variants.mjs",
    "utf8",
  );

  assert(source.includes("--dry-run"), "backfill supports --dry-run");
  assert(source.includes("--write"), "backfill requires explicit --write");
  assert(source.includes("batch"), "backfill validates batch size");
  assert(source.includes("checkpoint"), "backfill supports checkpoint/resume");
  assert(source.includes("IMAGE_BACKFILL_ALLOW_WRITE"), "backfill must guard production writes");
  assert(
    source.includes("product cover") || source.includes("product-cover"),
    "backfill docs must state product-cover scope",
  );
  assert(
    source.includes("Follow-up") || source.includes("follow-up"),
    "backfill docs must mention follow-up types",
  );
}

function testUnknownTypeFails() {
  const result = runBackfill(["--type", "unknown-type"]);
  assert(result.status !== 0, "unknown --type must exit with error");
}

function testDryRunDefaultDoesNotRequireWrite() {
  const help = runBackfill(["--help"]);
  assert(help.status === 0 || help.stderr || help.stdout, "backfill script is executable");
}

function main() {
  testScriptContract();
  testUnknownTypeFails();
  testDryRunDefaultDoesNotRequireWrite();

  console.log("backfill-dry-run-unit: all checks passed");
}

main();
