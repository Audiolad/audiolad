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

const opsRemote = readFileSync(
  join(root, "deploy/scripts/audiolad-music-storage-bulk-ops-remote.sh"),
  "utf8",
);
assert.match(opsRemote, /exec sudo -n "\$SBIN"/);
assert.match(opsRemote, /resume/);

console.log("music-storage-bulk-sudo-unit: ok");