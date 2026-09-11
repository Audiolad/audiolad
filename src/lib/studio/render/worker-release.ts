/**
 * Version-aware release identity for the Studio render worker.
 *
 * Boot identity is the resolved realpath of the process cwd / boot release
 * directory plus `.deploy-commit` when present. Current identity is the
 * resolved realpath of the production `current` symlink and that path's
 * `.deploy-commit`. Do not treat a PM2 `pm_cwd` string of `/current` as
 * proof of the loaded release.
 */

import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

export const STUDIO_RENDER_CURRENT_RELEASE_LINK_DEFAULT =
  "/var/www/audiolad-deploy/current";

export const STUDIO_RENDER_CURRENT_RELEASE_LINK_ENV =
  "STUDIO_RENDER_CURRENT_RELEASE_LINK";

export const STUDIO_RENDER_DEPLOY_COMMIT_FILENAME = ".deploy-commit";

export type StudioRenderReleaseState = "CURRENT" | "STALE" | "UNKNOWN";

export type StudioRenderReleaseIdentity = {
  path: string | null;
  sha: string | null;
};

export type StudioRenderReleaseComparison = {
  state: StudioRenderReleaseState;
  bootReleasePath: string | null;
  bootSha: string | null;
  currentReleasePath: string | null;
  currentSha: string | null;
  reason?: string;
};

export function resolveStudioRenderCurrentReleaseLink(
  env: NodeJS.Dict<string> = process.env,
): string {
  const override = env[STUDIO_RENDER_CURRENT_RELEASE_LINK_ENV];
  if (typeof override === "string" && override.trim()) {
    return override.trim();
  }
  return STUDIO_RENDER_CURRENT_RELEASE_LINK_DEFAULT;
}

export async function readStudioRenderReleaseIdentity(
  targetPath: string,
): Promise<StudioRenderReleaseIdentity & { reason?: string }> {
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
    const raw = (await readFile(
      join(resolved, STUDIO_RENDER_DEPLOY_COMMIT_FILENAME),
      "utf8",
    )).trim();
    sha = raw || null;
  } catch {
    // SHA is optional; the resolved directory is the primary identity.
  }
  return { path: resolved, sha };
}

export async function captureStudioRenderBootRelease(
  bootDir: string = process.cwd(),
): Promise<StudioRenderReleaseIdentity> {
  const identity = await readStudioRenderReleaseIdentity(bootDir);
  return { path: identity.path, sha: identity.sha };
}

export async function compareStudioRenderRelease(options: {
  boot: StudioRenderReleaseIdentity;
  currentLinkPath?: string;
  env?: NodeJS.Dict<string>;
}): Promise<StudioRenderReleaseComparison> {
  const bootReleasePath = options.boot.path;
  const bootSha = options.boot.sha;
  const currentLinkPath = options.currentLinkPath
    ?? resolveStudioRenderCurrentReleaseLink(options.env);

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

  const current = await readStudioRenderReleaseIdentity(currentLinkPath);
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

export function formatStudioRenderWorkerBootLog(
  comparison: StudioRenderReleaseComparison,
): string {
  return JSON.stringify({
    event: "studio_render_worker_boot",
    bootReleasePath: comparison.bootReleasePath,
    bootSha: comparison.bootSha,
    currentReleasePath: comparison.currentReleasePath,
    currentSha: comparison.currentSha,
    releaseState: comparison.state,
  });
}

export function formatStudioRenderReleaseMismatchLog(
  comparison: StudioRenderReleaseComparison,
): string {
  return JSON.stringify({
    event: "studio_render_release_mismatch",
    bootSha: comparison.bootSha,
    currentSha: comparison.currentSha,
  });
}

export function formatStudioRenderReleaseUnavailableLog(reason: string): string {
  return JSON.stringify({
    event: "studio_render_release_guard_unavailable",
    reason,
  });
}
