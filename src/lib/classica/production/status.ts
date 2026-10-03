export const CLASSICA_STATUSES = [
  "queued",
  "in_progress",
  "audio_ready",
  "packaging_ready",
  "in_review",
  "needs_revision",
  "accepted",
  "published",
] as const;

export type ClassicaStatus = (typeof CLASSICA_STATUSES)[number];

export const CLASSICA_STATUS_LABELS: Record<ClassicaStatus, string> = {
  queued: "В очереди",
  in_progress: "В работе",
  audio_ready: "Аудио готово",
  packaging_ready: "Оформление готово",
  in_review: "На проверке",
  needs_revision: "На доработке",
  accepted: "Принято",
  published: "Опубликовано",
};

export const CLASSICA_WORK_STATUSES = [
  "in_progress",
  "audio_ready",
  "packaging_ready",
  "needs_revision",
] as const;

export type ClassicaWorkStatus = (typeof CLASSICA_WORK_STATUSES)[number];

const MARK_TARGETS: Record<ClassicaWorkStatus, readonly ClassicaStatus[]> = {
  in_progress: ["audio_ready", "packaging_ready"],
  audio_ready: ["in_progress", "packaging_ready"],
  packaging_ready: ["in_progress", "audio_ready"],
  needs_revision: ["in_progress", "audio_ready", "packaging_ready"],
};

export function isClassicaStatus(value: string | null | undefined): value is ClassicaStatus {
  return (
    typeof value === "string" &&
    (CLASSICA_STATUSES as readonly string[]).includes(value)
  );
}

export function classicaStatusLabel(status: string | null | undefined): string {
  return isClassicaStatus(status) ? CLASSICA_STATUS_LABELS[status] : "Неизвестный статус";
}

export function isClassicaWorkStatus(
  status: string | null | undefined,
): status is ClassicaWorkStatus {
  return (
    typeof status === "string" &&
    (CLASSICA_WORK_STATUSES as readonly string[]).includes(status)
  );
}

export function canMarkClassicaStatus(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (!isClassicaWorkStatus(from) || !isClassicaStatus(to)) {
    return false;
  }
  return MARK_TARGETS[from].includes(to);
}

export function classicaMarkTargets(status: string | null | undefined): ClassicaStatus[] {
  if (!isClassicaWorkStatus(status)) {
    return [];
  }
  return [...MARK_TARGETS[status]];
}

/** Statuses an admin may unreserve, reassign, or return to the queue. */
export function canAdminReleaseClassicaJob(status: string | null | undefined): boolean {
  return (
    status === "in_progress" ||
    status === "audio_ready" ||
    status === "packaging_ready" ||
    status === "needs_revision" ||
    status === "in_review"
  );
}

export function canSubmitClassicaJob(status: string | null | undefined): boolean {
  return isClassicaWorkStatus(status);
}

export function evaluateClassicaTake(input: {
  status: string | null | undefined;
  assigneeId: string | null;
  actorCanOperate: boolean;
}): { ok: true } | { ok: false; reason: "forbidden" | "not_queued" | "already_reserved" } {
  if (!input.actorCanOperate) {
    return { ok: false, reason: "forbidden" };
  }
  if (input.status !== "queued") {
    return { ok: false, reason: "not_queued" };
  }
  if (input.assigneeId) {
    return { ok: false, reason: "already_reserved" };
  }
  return { ok: true };
}

export type ClassicaEditActor = {
  isAssignee: boolean;
  isAdmin: boolean;
};

export function canEditClassicaCard(
  status: string | null | undefined,
  actor: ClassicaEditActor,
): boolean {
  if (status === "published") {
    return false;
  }
  if (actor.isAdmin) {
    return true;
  }
  return actor.isAssignee && isClassicaWorkStatus(status);
}

/** After a successful packaging run, block another OpenAI call for this job. */
export const CLASSICA_PACKAGING_COOLDOWN_MS = 2 * 60 * 1000;

export function classicaPackagingCooldownActive(
  packagingPreparedAt: string | null | undefined,
  now: Date,
): boolean {
  if (!packagingPreparedAt) {
    return false;
  }
  const preparedAt = Date.parse(packagingPreparedAt);
  if (!Number.isFinite(preparedAt)) {
    return false;
  }
  return now.getTime() - preparedAt < CLASSICA_PACKAGING_COOLDOWN_MS;
}
