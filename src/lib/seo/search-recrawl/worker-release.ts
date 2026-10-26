/**
 * Release identity for the audiolad.ru recrawl worker.
 * Boot identity is the resolved cwd. Current identity is the resolved
 * production symlink. A PM2 cwd string of `/current` is not proof that
 * this process loaded that release.
 */
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

export const SEARCH_RECRAWL_CURRENT_RELEASE_LINK_DEFAULT =
  "/var/www/audiolad-deploy/current";

export const SEARCH_RECRAWL_CURRENT_RELEASE_LINK_ENV =
  "SEARCH_RECRAWL_CURRENT_RELEASE_LINK";

const DEPLOY_COMMIT_FILENAME = ".deploy-commit";

export type SearchRecrawlReleaseState = "CURRENT" | "STALE" | "UNKNOWN";

export type SearchRecrawlReleaseIdentity = {
  path: string | null;
  sha: string | null;
};

export type SearchRecrawlReleaseComparison = {
  state: SearchRecrawlReleaseState;
  bootReleasePath: string | null;
  bootSha: string | null;
  currentReleasePath: string | null;
  currentSha: string | null;
  reason?: string;
};

export function resolveSearchRecrawlCurrentReleaseLink(
  env: NodeJS.Dict<string> = process.env,
): string {
  const override = env[SEARCH_RECRAWL_CURRENT_RELEASE_LINK_ENV];
  if (typeof override === "string" && override.trim()) {
    return override.trim();
  }

  return SEARCH_RECRAWL_CURRENT_RELEASE_LINK_DEFAULT;
}

export async function readSearchRecrawlReleaseIdentity(
  targetPath: string,
): Promise<SearchRecrawlReleaseIdentity & { reason?: string }> {
  if (!targetPath) {
    return { path: null, sha: null, reason: "release_path_missing" };
  }

  let resolved: string;

  try {
    resolved = await realpath(targetPath);
  } catch {
    return { path: null, sha: null, reason: "release_path_unreadable" };
  }

  let sha: string | null = null;

  try {
    const raw = (await readFile(join(resolved, DEPLOY_COMMIT_FILENAME), "utf8")).trim();
    sha = raw || null;
  } catch {
    // The directory is the identity. The commit file is optional.
  }

  return { path: resolved, sha };
}

export async function captureSearchRecrawlBootRelease(
  bootDir: string = process.cwd(),
): Promise<SearchRecrawlReleaseIdentity> {
  const identity = await readSearchRecrawlReleaseIdentity(bootDir);
  return { path: identity.path, sha: identity.sha };
}

export async function compareSearchRecrawlRelease(options: {
  boot: SearchRecrawlReleaseIdentity;
  currentLinkPath?: string;
  env?: NodeJS.Dict<string>;
}): Promise<SearchRecrawlReleaseComparison> {
  const bootReleasePath = options.boot.path;
  const bootSha = options.boot.sha;
  const currentLinkPath =
    options.currentLinkPath ?? resolveSearchRecrawlCurrentReleaseLink(options.env);

  if (!bootReleasePath) {
    return {
      state: "UNKNOWN",
      bootReleasePath,
      bootSha,
      currentReleasePath: null,
      currentSha: null,
      reason: "boot_identity_unreadable",
    };
  }

  const current = await readSearchRecrawlReleaseIdentity(currentLinkPath);

  if (!current.path) {
    return {
      state: "UNKNOWN",
      bootReleasePath,
      bootSha,
      currentReleasePath: null,
      currentSha: null,
      reason: current.reason ?? "current_identity_unreadable",
    };
  }

  const pathMismatch = current.path !== bootReleasePath;
  const shaMismatch = Boolean(bootSha && current.sha && bootSha !== current.sha);

  if (pathMismatch || shaMismatch) {
    return {
      state: "STALE",
      bootReleasePath,
      bootSha,
      currentReleasePath: current.path,
      currentSha: current.sha,
    };
  }

  return {
    state: "CURRENT",
    bootReleasePath,
    bootSha,
    currentReleasePath: current.path,
    currentSha: current.sha,
  };
}
