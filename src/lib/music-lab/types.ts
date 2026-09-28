import type { MusicLabExperimentType } from "@/lib/music-lab/constants";

export type MusicLabStatus = "draft" | "open" | "completed";

export type MusicLabTaskType = "listen" | "similarity" | "bpm_key";

export type MusicLabExperiment = {
  id: string;
  code: string;
  version: string;
  experimentType: MusicLabExperimentType;
  title: string;
  status: MusicLabStatus;
  createdAt: string;
  completedAt: string | null;
  completedBy: string | null;
  sourceRefs: Record<string, unknown>;
  payload: Record<string, unknown>;
  provenance: Record<string, unknown>;
  resultsSnapshot: MusicLabResultsSnapshot | null;
};

export type MusicLabItem = {
  id: string;
  experimentId: string;
  externalKey: string;
  publicCode: string;
  storageBucket: string;
  storagePath: string;
  sourceFilename: string;
  mimeType: string;
  sortOrder: number;
  createdAt: string;
};

export type SimilaritySlot = "A" | "B";

export type SimilarityDefinition = {
  sets: Record<SimilaritySlot, { itemPublicCode: string; rank: number }[]>;
};

export type MusicLabTask = {
  id: string;
  experimentId: string;
  taskType: MusicLabTaskType;
  naturalKey: string;
  publicCode: string;
  sortOrder: number;
  subjectItemId: string;
  definition: SimilarityDefinition | Record<string, never>;
  createdAt: string;
};

export type ListenAnswers = {
  coarseGenre: string | null;
  styles: string[];
  stylesUncertain: boolean;
  vocalRole: string | null;
  instruments: string[];
  instrumentsOther: string;
  instrumentsUncertain: boolean;
  moods: string[];
  moodsUncertain: boolean;
  soundCharacter: string[];
  soundUncertain: boolean;
  comment: string;
};

export type SimilarityScore =
  | { score: 0 | 1 | 2 | 3 }
  | { uncertain: true };

export type SimilarityAnswers = {
  scores: Record<string, SimilarityScore>;
};

export type BpmAnswers = {
  bpm: number | null;
  bpmUncertain: boolean;
  key: string | null;
  keyUncertain: boolean;
};

export type MusicLabAnswers = ListenAnswers | SimilarityAnswers | BpmAnswers;

export type MusicLabResponse = {
  id: string;
  experimentId: string;
  taskId: string;
  respondentUserId: string;
  answers: MusicLabAnswers;
  createdAt: string;
  updatedAt: string;
};

export type MusicLabBlindAssignment = {
  id: string;
  experimentId: string;
  taskId: string;
  slotCode: SimilaritySlot;
  systemCode: string;
};

export type MusicLabFieldPolicy =
  | "AUTO"
  | "SUGGEST_CONFIRM"
  | "MANUAL"
  | "HIDDEN"
  | "DROP";

export type MusicLabResultSlotId =
  | "genre_top1"
  | "genre_top3"
  | "style_top1"
  | "style_top3"
  | "vocal"
  | "instruments"
  | "mood"
  | "bpm"
  | "key";

export type MusicLabResultsSnapshot = {
  slots: Partial<
    Record<
      MusicLabResultSlotId,
      {
        text: string;
        policy?: MusicLabFieldPolicy;
      }
    >
  >;
};

export type MusicLabRepository = {
  getExperimentByCode(code: string): Promise<MusicLabExperiment | null>;
  saveExperiment(experiment: MusicLabExperiment): Promise<void>;
  listItems(experimentId: string): Promise<MusicLabItem[]>;
  saveItem(item: MusicLabItem): Promise<void>;
  listTasks(experimentId: string): Promise<MusicLabTask[]>;
  saveTask(task: MusicLabTask): Promise<void>;
  listResponses(
    experimentId: string,
    respondentUserId?: string,
  ): Promise<MusicLabResponse[]>;
  saveResponse(response: MusicLabResponse): Promise<void>;
  listBlindAssignments(experimentId: string): Promise<MusicLabBlindAssignment[]>;
  saveBlindAssignment(assignment: MusicLabBlindAssignment): Promise<void>;
};
