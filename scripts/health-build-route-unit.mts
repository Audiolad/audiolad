import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { readDeployCommit } from "../src/app/api/health/build/route";

const directory = await mkdtemp(path.join(tmpdir(), "audiolad-health-build-"));

try {
  assert.equal(await readDeployCommit(directory), null, "missing deploy metadata is null");

  await writeFile(path.join(directory, ".deploy-commit"), "not-a-sha\n");
  assert.equal(await readDeployCommit(directory), null, "invalid deploy metadata is null");

  const sha = "A251297017B07FA3A066A0D9506C7331354E2229";
  await writeFile(path.join(directory, ".deploy-commit"), `${sha}\n`);
  assert.equal(
    await readDeployCommit(directory),
    sha.toLowerCase(),
    "valid full deploy SHA is returned",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("health-build-route-unit: ok");
