import type { SupabaseClient } from "@supabase/supabase-js";

import { MUSIC_LAB_TABLES } from "@/lib/music-lab/constants";
import type {
  MusicLabBlindAssignment,
  MusicLabExperiment,
  MusicLabItem,
  MusicLabRepository,
  MusicLabResponse,
  MusicLabResultsSnapshot,
  MusicLabTask,
} from "@/lib/music-lab/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type ExperimentRow = {
  id: string;
  code: string;
  version: string;
  experiment_type: MusicLabExperiment["experimentType"];
  title: string;
  status: MusicLabExperiment["status"];
  created_at: string;
  completed_at: string | null;
  completed_by: string | null;
  source_refs: Record<string, unknown>;
  payload: Record<string, unknown>;
  provenance: Record<string, unknown>;
  results_snapshot: MusicLabResultsSnapshot | null;
};

type ItemRow = {
  id: string;
  experiment_id: string;
  external_key: string;
  public_code: string;
  storage_bucket: string;
  storage_path: string;
  source_filename: string;
  mime_type: string;
  sort_order: number;
  created_at: string;
};

type TaskRow = {
  id: string;
  experiment_id: string;
  task_type: MusicLabTask["taskType"];
  natural_key: string;
  public_code: string;
  sort_order: number;
  subject_item_id: string;
  definition: MusicLabTask["definition"];
  created_at: string;
};

type ResponseRow = {
  id: string;
  experiment_id: string;
  task_id: string;
  respondent_user_id: string;
  answers: MusicLabResponse["answers"];
  created_at: string;
  updated_at: string;
};

type BlindRow = {
  id: string;
  experiment_id: string;
  task_id: string;
  slot_code: MusicLabBlindAssignment["slotCode"];
  system_code: string;
};

function mapExperiment(row: ExperimentRow): MusicLabExperiment {
  return {
    id: row.id,
    code: row.code,
    version: row.version,
    experimentType: row.experiment_type,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    sourceRefs: row.source_refs ?? {},
    payload: row.payload ?? {},
    provenance: row.provenance ?? {},
    resultsSnapshot: row.results_snapshot,
  };
}

function mapItem(row: ItemRow): MusicLabItem {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    externalKey: row.external_key,
    publicCode: row.public_code,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    sourceFilename: row.source_filename,
    mimeType: row.mime_type,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapTask(row: TaskRow): MusicLabTask {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    taskType: row.task_type,
    naturalKey: row.natural_key,
    publicCode: row.public_code,
    sortOrder: row.sort_order,
    subjectItemId: row.subject_item_id,
    definition: row.definition ?? {},
    createdAt: row.created_at,
  };
}

function mapResponse(row: ResponseRow): MusicLabResponse {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    taskId: row.task_id,
    respondentUserId: row.respondent_user_id,
    answers: row.answers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBlind(row: BlindRow): MusicLabBlindAssignment {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    taskId: row.task_id,
    slotCode: row.slot_code,
    systemCode: row.system_code,
  };
}

function throwIfError(error: { message?: string } | null): void {
  if (!error) {
    return;
  }
  if (error.message?.includes("music_lab_responses_locked")) {
    throw new Error("music_lab_responses_locked");
  }
  throw new Error("music_lab_storage_failed");
}

export function createMusicLabRepository(
  client: SupabaseClient = createServiceRoleClient(),
): MusicLabRepository {
  return {
    async getExperimentByCode(code) {
      const { data, error } = await client
        .from(MUSIC_LAB_TABLES.experiments)
        .select(
          "id, code, version, experiment_type, title, status, created_at, completed_at, completed_by, source_refs, payload, provenance, results_snapshot",
        )
        .eq("code", code)
        .maybeSingle();
      throwIfError(error);
      return data ? mapExperiment(data as ExperimentRow) : null;
    },
    async saveExperiment(experiment) {
      const { error } = await client.from(MUSIC_LAB_TABLES.experiments).upsert(
        {
          id: experiment.id,
          code: experiment.code,
          version: experiment.version,
          experiment_type: experiment.experimentType,
          title: experiment.title,
          status: experiment.status,
          created_at: experiment.createdAt,
          completed_at: experiment.completedAt,
          completed_by: experiment.completedBy,
          source_refs: experiment.sourceRefs,
          payload: experiment.payload,
          provenance: experiment.provenance,
          results_snapshot: experiment.resultsSnapshot,
        },
        { onConflict: "id" },
      );
      throwIfError(error);
    },
    async listItems(experimentId) {
      const { data, error } = await client
        .from(MUSIC_LAB_TABLES.items)
        .select(
          "id, experiment_id, external_key, public_code, storage_bucket, storage_path, source_filename, mime_type, sort_order, created_at",
        )
        .eq("experiment_id", experimentId)
        .order("sort_order", { ascending: true });
      throwIfError(error);
      return ((data ?? []) as ItemRow[]).map(mapItem);
    },
    async saveItem(item) {
      const { error } = await client.from(MUSIC_LAB_TABLES.items).upsert(
        {
          id: item.id,
          experiment_id: item.experimentId,
          external_key: item.externalKey,
          public_code: item.publicCode,
          storage_bucket: item.storageBucket,
          storage_path: item.storagePath,
          source_filename: item.sourceFilename,
          mime_type: item.mimeType,
          sort_order: item.sortOrder,
          created_at: item.createdAt,
        },
        { onConflict: "id" },
      );
      throwIfError(error);
    },
    async listTasks(experimentId) {
      const { data, error } = await client
        .from(MUSIC_LAB_TABLES.tasks)
        .select(
          "id, experiment_id, task_type, natural_key, public_code, sort_order, subject_item_id, definition, created_at",
        )
        .eq("experiment_id", experimentId)
        .order("sort_order", { ascending: true });
      throwIfError(error);
      return ((data ?? []) as TaskRow[]).map(mapTask);
    },
    async saveTask(task) {
      const { error } = await client.from(MUSIC_LAB_TABLES.tasks).upsert(
        {
          id: task.id,
          experiment_id: task.experimentId,
          task_type: task.taskType,
          natural_key: task.naturalKey,
          public_code: task.publicCode,
          sort_order: task.sortOrder,
          subject_item_id: task.subjectItemId,
          definition: task.definition,
          created_at: task.createdAt,
        },
        { onConflict: "id" },
      );
      throwIfError(error);
    },
    async listResponses(experimentId, respondentUserId) {
      let query = client
        .from(MUSIC_LAB_TABLES.responses)
        .select(
          "id, experiment_id, task_id, respondent_user_id, answers, created_at, updated_at",
        )
        .eq("experiment_id", experimentId);
      if (respondentUserId) {
        query = query.eq("respondent_user_id", respondentUserId);
      }
      const { data, error } = await query;
      throwIfError(error);
      return ((data ?? []) as ResponseRow[]).map(mapResponse);
    },
    async saveResponse(response) {
      const { error } = await client.from(MUSIC_LAB_TABLES.responses).upsert(
        {
          id: response.id,
          experiment_id: response.experimentId,
          task_id: response.taskId,
          respondent_user_id: response.respondentUserId,
          answers: response.answers,
          created_at: response.createdAt,
          updated_at: response.updatedAt,
        },
        { onConflict: "id" },
      );
      throwIfError(error);
    },
    async listBlindAssignments(experimentId) {
      const { data, error } = await client
        .from(MUSIC_LAB_TABLES.blindAssignments)
        .select("id, experiment_id, task_id, slot_code, system_code")
        .eq("experiment_id", experimentId);
      throwIfError(error);
      return ((data ?? []) as BlindRow[]).map(mapBlind);
    },
    async saveBlindAssignment(assignment) {
      const { error } = await client.from(MUSIC_LAB_TABLES.blindAssignments).upsert(
        {
          id: assignment.id,
          experiment_id: assignment.experimentId,
          task_id: assignment.taskId,
          slot_code: assignment.slotCode,
          system_code: assignment.systemCode,
        },
        { onConflict: "id" },
      );
      throwIfError(error);
    },
  };
}
