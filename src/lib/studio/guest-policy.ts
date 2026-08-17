import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  STUDIO_GUEST_COOKIE_NAME,
  STUDIO_GUEST_DEFAULT_TTL_DAYS,
  STUDIO_GUEST_MAX_PROJECTS,
  STUDIO_GUEST_RENDER_RATE_LIMIT,
  STUDIO_GUEST_RENDER_RATE_WINDOW_MS,
  getStudioGuestTtlDays,
} from "./guest-constants";

export {
  STUDIO_GUEST_COOKIE_NAME,
  STUDIO_GUEST_DEFAULT_TTL_DAYS,
  STUDIO_GUEST_MAX_PROJECTS,
  STUDIO_GUEST_RENDER_RATE_LIMIT,
  STUDIO_GUEST_RENDER_RATE_WINDOW_MS,
  getStudioGuestTtlDays,
};

export function createGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function guestTokenHashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type StudioOwnerKind = "author" | "guest";

export type StudioActorView =
  | { kind: "author"; authorIds: readonly string[] }
  | { kind: "guest"; sessionId: string }
  | { kind: "none" };

export type StudioProjectAccessRow = {
  id: string;
  status: string;
  author_id: string | null;
  guest_session_id: string | null;
};


export type StudioProjectAccessOk = {
  ok: true;
  ownerKind: StudioOwnerKind;
  ownerId: string;
  authorId: string | null;
  guestSessionId: string | null;
};


export type StudioProjectAccessDenied = {
  ok: false;
  error: "not_found";
};


export function resolveStudioProjectAccess(input: {
  project: StudioProjectAccessRow | null;
  actor: StudioActorView;
}): StudioProjectAccessOk | StudioProjectAccessDenied {
  const project = input.project;
  if (!project || project.status !== "active") {
    return { ok: false, error: "not_found" };
  }

  if (project.author_id) {
    if (
      input.actor.kind !== "author" ||
      !input.actor.authorIds.includes(project.author_id)
    ) {
      return { ok: false, error: "not_found" };
    }
    return {
      ok: true,
      ownerKind: "author",
      ownerId: project.author_id,
      authorId: project.author_id,
      guestSessionId: null,
    };
  }

  if (project.guest_session_id) {
    if (
      input.actor.kind !== "guest" ||
      input.actor.sessionId !== project.guest_session_id
    ) {
      return { ok: false, error: "not_found" };
    }
    return {
      ok: true,
      ownerKind: "guest",
      ownerId: project.guest_session_id,
      authorId: null,
      guestSessionId: project.guest_session_id,
    };
  }

  return { ok: false, error: "not_found" };
}

export function canCreateGuestProject(activeCount: number): boolean {
  return activeCount < STUDIO_GUEST_MAX_PROJECTS;
}

export function guestRenderEntitlementConsumed(session: {
  free_render_consumed_at: string | null;
}): boolean {
  return session.free_render_consumed_at != null;
}

export type StudioDownloadableJob = {
  id: string;
  project_id: string;
  project_revision: number;
  status: string;
  output_storage_path: string | null;
};


export function selectDownloadableStudioRenderJob(input: {
  projectId: string;
  currentRevision: number;
  currentRevisionJob: StudioDownloadableJob | null;
  entitledJob: StudioDownloadableJob | null;
}): StudioDownloadableJob | null {
  const current = input.currentRevisionJob;
  if (
    current &&
    current.project_id === input.projectId &&
    current.project_revision === input.currentRevision &&
    current.status === "completed" &&
    current.output_storage_path
  ) {
    return current;
  }

  const entitled = input.entitledJob;
  if (
    entitled &&
    entitled.project_id === input.projectId &&
    entitled.status === "completed" &&
    entitled.output_storage_path
  ) {
    return entitled;
  }

  return null;
}

export function evaluateGuestRenderCreate(input: {
  consumed: boolean;
  hasActiveJob: boolean;
  rateLimited: boolean;
}):
  | { ok: true }
  | {
      ok: false;
      error:
        | "guest_render_entitlement"
        | "render_already_queued"
        | "rate_limited";
    } {
  if (input.consumed) {
    return { ok: false, error: "guest_render_entitlement" };
  }
  if (input.hasActiveJob) {
    return { ok: false, error: "render_already_queued" };
  }
  if (input.rateLimited) {
    return { ok: false, error: "rate_limited" };
  }
  return { ok: true };
}

export function shouldConsumeGuestRenderOnSuccess(job: {
  guest_session_id: string | null;
  status: string;
}): boolean {
  return job.status === "completed" && job.guest_session_id != null;
}

export type GuestCleanupPlan = {
  sessionIds: string[];
  projectIds: string[];
  assetIds: string[];
  jobIds: string[];
  storagePaths: string[];
};


export function planGuestSessionCleanup(input: {
  now: Date;
  sessions: Array<{ id: string; expires_at: string }>;
  projects: Array<{
    id: string;
    author_id: string | null;
    guest_session_id: string | null;
  }>;
  assets: Array<{ id: string; project_id: string; storage_path: string }>;
  jobs: Array<{
    id: string;
    project_id: string;
    author_id: string | null;
    guest_session_id: string | null;
    output_storage_path: string | null;
  }>;
}): GuestCleanupPlan {
  const expiredIds = input.sessions
    .filter((session) => new Date(session.expires_at).getTime() < input.now.getTime())
    .map((session) => session.id);
  const sessionSet = new Set(expiredIds);

  const projects = input.projects.filter(
    (project) =>
      project.author_id == null &&
      project.guest_session_id != null &&
      sessionSet.has(project.guest_session_id),
  );
  const projectIds = projects.map((project) => project.id);
  const projectSet = new Set(projectIds);

  const assets = input.assets.filter((asset) => projectSet.has(asset.project_id));
  const jobs = input.jobs.filter(
    (job) =>
      job.author_id == null &&
      job.guest_session_id != null &&
      sessionSet.has(job.guest_session_id) &&
      projectSet.has(job.project_id),
  );

  return {
    sessionIds: expiredIds,
    projectIds,
    assetIds: assets.map((asset) => asset.id),
    jobIds: jobs.map((job) => job.id),
    storagePaths: [
      ...assets.map((asset) => asset.storage_path),
      ...jobs
        .map((job) => job.output_storage_path)
        .filter((path): path is string => Boolean(path)),
    ],
  };
}

export function buildStudioGuestCookieOptions(input: {
  ttlDays?: number;
  secure?: boolean;
  now?: Date;
} = {}): {
  name: typeof STUDIO_GUEST_COOKIE_NAME;
  httpOnly: true;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
} {
  const ttlDays = input.ttlDays ?? getStudioGuestTtlDays();
  return {
    name: STUDIO_GUEST_COOKIE_NAME,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: input.secure ?? process.env.NODE_ENV === "production",
    maxAge: ttlDays * 24 * 60 * 60,
  };
}
