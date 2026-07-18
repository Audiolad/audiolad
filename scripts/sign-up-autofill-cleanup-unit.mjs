#!/usr/bin/env node
/**
 * Static checks for sign-up autofill sync cleanup in page.tsx.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pagePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "app",
  "auth",
  "sign-up",
  "page.tsx",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const source = readFileSync(pagePath, "utf8");

assert(source.includes("let cancelled = false"), "autofill sync uses cancelled guard");
assert(source.includes("cancelled = true"), "autofill cleanup marks cancelled");
assert(source.includes("window.clearInterval(interval)"), "autofill cleanup clears interval");
assert(source.includes("window.clearTimeout(stopInterval)"), "autofill cleanup clears stop timeout");
assert(
  source.includes('form.removeEventListener("focusin", syncAutofillValues)'),
  "autofill cleanup removes focusin listener",
);
assert(
  !source.includes('form.addEventListener("input", syncAutofillValues)'),
  "autofill avoids duplicate form-level input listener",
);
assert(
  /useEffect\(\(\) => \{[\s\S]*?\}, \[\]\);/.test(source),
  "autofill effect mounts once and does not restart polling on each keystroke",
);
assert(source.includes("3000"), "autofill polling stops after 3 seconds");
assert(source.includes("fieldValuesRef"), "autofill reads latest values through ref");

console.log("sign-up-autofill-cleanup-unit: ok");
