import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeHallAppVersion } from "@/lib/business-app/hall-build-reload";

const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;

/**
 * Same sources as /api/health/build: .deploy-commit first, then .next/BUILD_ID.
 * Kept in lib so loaders do not import a route module.
 */
export async function readServerHallBuildId(cwd = process.cwd()): Promise<string | null> {
  try {
    const deployCommit = (await readFile(path.join(cwd, ".deploy-commit"), "utf8")).trim();
    if (FULL_GIT_SHA.test(deployCommit)) {
      return normalizeHallAppVersion(deployCommit.toLowerCase());
    }
  } catch {
    /* missing deploy marker */
  }
  try {
    const buildId = (await readFile(path.join(cwd, ".next", "BUILD_ID"), "utf8")).trim();
    return normalizeHallAppVersion(buildId);
  } catch {
    return null;
  }
}
