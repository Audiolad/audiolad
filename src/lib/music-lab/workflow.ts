import { randomUUID } from "node:crypto";

import {
  completionReport,
  MusicLabAnswerError,
  normalizeTaskAnswers,
} from "@/lib/music-lab/answers";
import { decideMusicLabAccess, type MusicLabAccessDecision } from "@/lib/music-lab/access-policy";
import { MUSIC_LAB_BUCKET, MUSIC_LAB_EXPERIMENT_CODE } from "@/lib/music-lab/constants";
import { importListeningPacket, type MusicLabImportReport } from "@/lib/music-lab/import-packet";
import {
  defaultListeningPacketDir,
  readListeningPacketDir,
  type ListeningPacket,
} from "@/lib/music-lab/packet";
import { assertMusicLabClientSafe } from "@/lib/music-lab/client-safety";
import { buildMusicLabResultsView, normalizeResultsSnapshot } from "@/lib/music-lab/results";
import type { MusicLabResultsView } from "@/lib/music-lab/results-types";
import type { MusicLabRepository, MusicLabResponse } from "@/lib/music-lab/types";

export class MusicLabWorkflowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

function assertSafePath(path: string): boolean {
  return (
    path === `${MUSIC_LAB_EXPERIMENT_CODE}/${path.split("/").at(-1)}` &&
    /^listening-v05\/[a-z][a-z0-9]{1,15}\.(mp3|wav)$/.test(path) &&
    !path.includes("..")
  );
}

export async function saveMusicLabResponse(input: {
  repository: MusicLabRepository;
  userId: string;
  taskCode: string;
  answers: unknown;
  now?: Date;
}): Promise<{ ok: true }> {
  const experiment = await input.repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
  if (!experiment) {
    throw new MusicLabWorkflowError("not_found", 404);
  }
  if (experiment.status === "completed") {
    throw new MusicLabWorkflowError("responses_locked", 409);
  }

  const tasks = await input.repository.listTasks(experiment.id);
  const task = tasks.find((entry) => entry.publicCode === input.taskCode);
  if (!task) {
    throw new MusicLabWorkflowError("not_found", 404);
  }

  let answers;
  try {
    answers = normalizeTaskAnswers(task.taskType, task.definition, input.answers);
  } catch (error) {
    if (error instanceof MusicLabAnswerError) {
      throw new MusicLabWorkflowError(error.code, 400);
    }
    throw error;
  }

  const existing = (await input.repository.listResponses(experiment.id, input.userId)).find(
    (response) => response.taskId === task.id,
  );
  const now = (input.now ?? new Date()).toISOString();
  const response: MusicLabResponse = {
    id: existing?.id ?? randomUUID(),
    experimentId: experiment.id,
    taskId: task.id,
    respondentUserId: input.userId,
    answers,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await input.repository.saveResponse(response);
  return { ok: true };
}

export async function completeMusicLabExperiment(input: {
  repository: MusicLabRepository;
  userId: string;
  now?: Date;
}): Promise<{ ok: true }> {
  const experiment = await input.repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
  if (!experiment) {
    throw new MusicLabWorkflowError("not_found", 404);
  }
  if (experiment.status === "completed") {
    return { ok: true };
  }

  const tasks = await input.repository.listTasks(experiment.id);
  const responses = await input.repository.listResponses(experiment.id, input.userId);
  const answersByTaskId = new Map(responses.map((response) => [response.taskId, response.answers]));
  const report = completionReport(tasks, answersByTaskId);
  if (!report.ok || tasks.length === 0) {
    throw new MusicLabWorkflowError("incomplete", 409, report.missing);
  }

  const now = (input.now ?? new Date()).toISOString();
  await input.repository.saveExperiment({
    ...experiment,
    status: "completed",
    completedAt: now,
    completedBy: input.userId,
  });
  return { ok: true };
}

export async function reopenMusicLabExperiment(input: {
  repository: MusicLabRepository;
}): Promise<{ ok: true }> {
  const experiment = await input.repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
  if (!experiment) {
    throw new MusicLabWorkflowError("not_found", 404);
  }
  if (experiment.status !== "completed") {
    return { ok: true };
  }
  await input.repository.saveExperiment({
    ...experiment,
    status: "open",
    completedAt: null,
    completedBy: null,
  });
  return { ok: true };
}

export async function importBundledListeningPacket(
  repository: MusicLabRepository,
  packet?: ListeningPacket,
): Promise<MusicLabImportReport> {
  const resolved = packet ?? readListeningPacketDir(defaultListeningPacketDir());
  return importListeningPacket(repository, resolved);
}

export async function saveMusicLabResultsSnapshot(input: {
  repository: MusicLabRepository;
  snapshot: unknown;
}): Promise<{ ok: true }> {
  const experiment = await input.repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
  if (!experiment) {
    throw new MusicLabWorkflowError("not_found", 404);
  }
  if (experiment.status !== "completed") {
    throw new MusicLabWorkflowError("results_locked", 409);
  }
  let snapshot;
  try {
    snapshot = normalizeResultsSnapshot(input.snapshot);
    assertMusicLabClientSafe(snapshot);
  } catch {
    throw new MusicLabWorkflowError("invalid_results_snapshot", 400);
  }
  const responsesBefore = await input.repository.listResponses(experiment.id);
  await input.repository.saveExperiment({
    ...experiment,
    resultsSnapshot: snapshot,
  });
  const responsesAfter = await input.repository.listResponses(experiment.id);
  if (responsesAfter.length !== responsesBefore.length) {
    throw new MusicLabWorkflowError("responses_changed", 500);
  }
  return { ok: true };
}

export async function readMusicLabResults(input: {
  repository: MusicLabRepository;
  userId: string;
}): Promise<MusicLabResultsView> {
  const experiment = await input.repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
  if (!experiment || experiment.status !== "completed") {
    return { locked: true };
  }
  const respondentId = experiment.completedBy ?? input.userId;
  const [items, tasks, responses, blindAssignments] = await Promise.all([
    input.repository.listItems(experiment.id),
    input.repository.listTasks(experiment.id),
    input.repository.listResponses(experiment.id, respondentId),
    input.repository.listBlindAssignments(experiment.id),
  ]);
  return buildMusicLabResultsView({
    experiment,
    items,
    tasks,
    responses,
    blindAssignments,
  });
}

export async function authorizeMusicLabAudio(input: {
  decision: MusicLabAccessDecision;
  publicCode: string;
  repository: MusicLabRepository;
  sign: (bucket: string, path: string) => Promise<string | null>;
}): Promise<{ status: number; body: { error?: string; url?: string } }> {
  if (input.decision === "anonymous") {
    return { status: 401, body: { error: "unauthorized" } };
  }
  if (input.decision !== "allow") {
    return { status: 404, body: { error: "not_found" } };
  }
  if (!/^[a-z][a-z0-9]{1,15}$/.test(input.publicCode)) {
    return { status: 404, body: { error: "not_found" } };
  }

  const experiment = await input.repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
  if (!experiment) {
    return { status: 404, body: { error: "audio_missing" } };
  }
  const items = await input.repository.listItems(experiment.id);
  const item = items.find((entry) => entry.publicCode === input.publicCode);
  if (!item || item.storageBucket !== MUSIC_LAB_BUCKET || !assertSafePath(item.storagePath)) {
    return { status: 404, body: { error: "audio_missing" } };
  }

  const url = await input.sign(item.storageBucket, item.storagePath);
  if (!url) {
    return { status: 404, body: { error: "audio_missing" } };
  }
  return { status: 200, body: { url } };
}

export function audioDecisionFromRoles(input: {
  userId: string | null;
  roles: readonly string[];
}): MusicLabAccessDecision {
  return decideMusicLabAccess(input);
}
