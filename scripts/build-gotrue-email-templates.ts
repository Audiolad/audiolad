#!/usr/bin/env node
/**
 * Generates GoTrue HTML templates from the shared brand email layout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderRecoveryGoTrueTemplateHtml } from "../src/lib/email/templates/recovery";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "supabase", "templates");

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const recoveryHtml = renderRecoveryGoTrueTemplateHtml();
  const recoveryPath = path.join(OUTPUT_DIR, "recovery.html");

  writeFileSync(recoveryPath, `${recoveryHtml}\n`, "utf8");

  console.log(`build-gotrue-email-templates: wrote ${recoveryPath}`);
}

main();
