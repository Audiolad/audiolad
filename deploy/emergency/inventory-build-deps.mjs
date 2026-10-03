import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const lockPath = join(repoRoot, "package-lock.json");
const lockText = readFileSync(lockPath);
const lock = JSON.parse(lockText.toString("utf8"));
const hosts = {};
let packageCount = 0;
for (const meta of Object.values(lock.packages ?? {})) {
  if (!meta || !meta.resolved) continue;
  packageCount += 1;
  const host = new URL(meta.resolved).host;
  hosts[host] = (hosts[host] ?? 0) + 1;
}

const inventory = {
  schema: 1,
  generatedFrom: "package-lock.json",
  lockfileVersion: lock.lockfileVersion,
  lockfileSha256: createHash("sha256").update(lockText).digest("hex"),
  packageCount,
  hosts,
  expectedNodeMajor: 22,
  nodeEvidence: "GitHub workflow studio-catalog-render-ffmpeg.yml pins node-version 22. Production Node is already installed on the Timeweb host and is not changed by this inventory.",
  npmCi: "deploy/scripts/deploy.sh runs npm ci. Offline mode is used only when DEPLOY_ROOT/shared/npm-ci-offline.env exists.",
  dockerImages: [
    {
      image: "postgres:16",
      where: ".github/workflows isolated jobs",
      class: "REQUIRED_ONLY_FOR_OPTIONAL_FEATURE",
      note: "CI service for isolated SQL tests. Not used by the production deploy build.",
    },
    {
      image: "supabase/postgres:15.14.1.171",
      where: ".github/workflows/pr-repository-validation.yml and database-migrations-compile-isolated.yml",
      class: "REQUIRED_FOR_NEW_DEPLOY",
      note: "Required to run the repository validation job on GitHub-hosted runners. The production database is the already-running self-hosted Supabase docker stack, whose image tags are not stored in this repo.",
    },
    {
      image: "louislam/uptime-kuma:1",
      where: "deploy/monitoring/docker-compose.yml",
      class: "REQUIRED_ONLY_FOR_OPTIONAL_FEATURE",
      note: "Optional monitoring compose. The public site does not depend on it.",
    },
  ],
  binaries: [
    {
      name: "node",
      version: "22",
      class: "REQUIRED_FOR_NEW_DEPLOY",
    },
    {
      name: "npm",
      class: "REQUIRED_FOR_NEW_DEPLOY",
      note: "Invoked as npm ci and npm run build inside deploy.sh.",
    },
    {
      name: "git",
      class: "REQUIRED_FOR_NEW_DEPLOY",
    },
    {
      name: "ffmpeg",
      class: "REQUIRED_ONLY_FOR_OPTIONAL_FEATURE",
      note: "Studio render, music transcode, and product audio normalize workers. Already installed on the production host. Not downloaded by deploy.sh.",
    },
  ],
};

const destination = join(dirname(fileURLToPath(import.meta.url)), "build-dependency-inventory.json");
writeFileSync(destination, `${JSON.stringify(inventory, null, 2)}\n`);
process.stdout.write(`wrote ${destination} packages=${packageCount}\n`);
