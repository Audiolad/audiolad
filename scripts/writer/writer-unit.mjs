#!/usr/bin/env node
/**
 * `node scripts/writer/writer-unit.mjs` – the documented command.
 * The suite imports the TypeScript article registry, so this file re-runs itself
 * under tsx (local node_modules, or `npx --no-install tsx` when that binary is already cached).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(import.meta.url);
const localTsx = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));

if (process.env.WRITER_UNIT_TSX !== "1") {
  const command = existsSync(localTsx)
    ? [process.execPath, localTsx, entry]
    : ["npx", "--no-install", "tsx", entry];
  const result = spawnSync(command[0], command.slice(1), {
    stdio: "inherit",
    env: { ...process.env, WRITER_UNIT_TSX: "1" },
  });
  if (result.error) {
    process.stderr.write(`writer-unit: не удалось запустить tsx (${result.error.message}). После npm ci: node scripts/writer/writer-unit.mjs\n`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

await import("./writer-unit-suite.mjs");
