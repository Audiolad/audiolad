import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sudoersPath = join(root, "deploy/sudoers/audiolad-music-storage-bulk");
const sudoersText = readFileSync(sudoersPath, "utf8");

for (const line of sudoersText.split("\n")) {
  if (!line.startsWith("deploy ")) {
    continue;
  }
  assert.doesNotMatch(line, /NOPASSWD:\s*ALL/);
  assert.doesNotMatch(line, /SETENV/);
  assert.doesNotMatch(line, /\*/);
}

for (const line of [
  /^deploy ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/audiolad-music-storage-bulk-install ""$/m,
  /^deploy ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/audiolad-music-storage-bulk-ops-resume ""$/m,
]) {
  assert.match(sudoersText, line);
}

const bashScripts = [
  "deploy/scripts/audiolad-music-storage-bulk-install-remote.sh",
  "deploy/scripts/audiolad-music-storage-bulk-ops-remote.sh",
  "deploy/scripts/audiolad-music-storage-bulk-root-install.sh",
  "deploy/scripts/audiolad-music-storage-bulk-sudo-bootstrap.sh",
  "deploy/scripts/audiolad-music-storage-bulk-ops-privileged.sh",
  ...[
    "audiolad-music-storage-bulk-install",
    "audiolad-music-storage-bulk-sudo-bootstrap",
    "audiolad-music-storage-bulk-ops-status",
    "audiolad-music-storage-bulk-ops-start-copy",
    "audiolad-music-storage-bulk-ops-pause",
    "audiolad-music-storage-bulk-ops-stop",
    "audiolad-music-storage-bulk-ops-resume",
  ].map((name) => `deploy/sbin/${name}`),
];

for (const rel of bashScripts) {
  const path = join(root, rel);
  const syntax = spawnSync("bash", ["-n", path], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `${rel}: ${syntax.stderr}`);
}

const rootInstall = readFileSync(
  join(root, "deploy/scripts/audiolad-music-storage-bulk-root-install.sh"),
  "utf8",
);
assert.match(rootInstall, /ensure_dir/);
assert.doesNotMatch(rootInstall, /install -d -m.*ETC_AUDIOLAD/);

const installRemote = readFileSync(
  join(root, "deploy/scripts/audiolad-music-storage-bulk-install-remote.sh"),
  "utf8",
);
assert.match(installRemote, /sudo -n \/usr\/local\/sbin\/audiolad-music-storage-bulk-install/);
assert.doesNotMatch(sudoersText, /\/current\/deploy\/scripts/);
assert.match(
  readFileSync(join(root, "deploy/sbin/audiolad-music-storage-bulk-install"), "utf8"),
  /\/usr\/local\/lib\/audiolad\/audiolad-music-storage-bulk-root-install\.sh/,
);

const opsRemote = readFileSync(
  join(root, "deploy/scripts/audiolad-music-storage-bulk-ops-remote.sh"),
  "utf8",
);
assert.match(opsRemote, /exec sudo -n "\$SBIN"/);
assert.match(opsRemote, /resume/);

const bootstrapTest = spawnSync(
  "bash",
  [join(root, "deploy/scripts/audiolad-music-storage-bulk-bootstrap-test.sh")],
  { encoding: "utf8" },
);
assert.equal(
  bootstrapTest.status,
  0,
  `bootstrap integration: ${bootstrapTest.stderr || bootstrapTest.stdout}`,
);

const deploySh = readFileSync(join(root, "deploy/scripts/deploy.sh"), "utf8");
assert.match(deploySh, /music_storage_bulk_privileged_assets_ensure_failed/);
assert.doesNotMatch(deploySh, /music_storage_bulk_privileged_assets_ensure_failed_non_fatal/);

console.log("music-storage-bulk-sudo-unit: ok");