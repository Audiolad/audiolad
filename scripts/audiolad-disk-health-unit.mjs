#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "../deploy/scripts/audiolad-disk-health.sh",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function classify(pct) {
  const result = spawnSync(
    "bash",
    [
      "-lc",
      `
        source "${script}"
        state="$(classify_disk_used_pct ${pct})"
        warning="$(kuma_push_status_for_level "$state" warning)"
        critical="$(kuma_push_status_for_level "$state" critical)"
        printf '%s %s %s\\n' "$state" "$warning" "$critical"
      `,
    ],
    { encoding: "utf8" },
  );
  assert(result.status === 0, result.stderr || result.stdout);
  return (result.stdout ?? "").trim();
}

const cases = [
  [84, "ok up up"],
  [85, "warning down up"],
  [89, "warning down up"],
  [90, "critical down down"],
  [99, "critical down down"],
];

for (const [pct, expected] of cases) {
  const actual = classify(pct);
  assert(actual === expected, `${pct}% expected ${expected}, got ${actual}`);
}

const missing = spawnSync(
  "bash",
  [
    "-lc",
    `
      source "${script}"
      logger() { printf 'LOG %s\\n' "$*"; }
      curl() { echo "curl should not run"; return 99; }
      unset AUDIOLAD_DISK_WARNING_PUSH_URL AUDIOLAD_DISK_CRITICAL_PUSH_URL
      notify_kuma_push warning down ""
      notify_kuma_push critical down ""
    `,
  ],
  { encoding: "utf8" },
);
assert(missing.status === 0, missing.stderr || missing.stdout);
assert(missing.stdout.includes("notification config missing level=warning"), missing.stdout);
assert(missing.stdout.includes("notification config missing level=critical"), missing.stdout);
assert(!missing.stdout.includes("curl should not run"), missing.stdout);

console.log("audiolad-disk-health-unit: ok");
