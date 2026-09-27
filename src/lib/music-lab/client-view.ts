import {
  emptyBpmAnswers,
  emptyListenAnswers,
  emptySimilarityAnswers,
  isBpmComplete,
  isListenComplete,
  isSimilarityComplete,
  isSimilarityDefinition,
  normalizeBpmAnswers,
  normalizeListenAnswers,
  normalizeSimilarityAnswers,
  similarityNeighbourCodes,
} from "@/lib/music-lab/answers";
import { assertMusicLabClientSafe } from "@/lib/music-lab/client-safety";
import type {
  BpmAnswers,
  ListenAnswers,
  MusicLabExperiment,
  MusicLabItem,
  MusicLabResponse,
  MusicLabTask,
  SimilarityAnswers,
} from "@/lib/music-lab/types";

export type ClientListenTask = {
  code: string;
  label: string;
  position: number;
  total: number;
  itemPublicCode: string;
  answers: ListenAnswers;
};

export type ClientNeighbour = {
  publicCode: string;
  label: string;
  rank: number;
};

export type ClientSimilarityTask = {
  code: string;
  label: string;
  position: number;
  total: number;
  seedPublicCode: string;
  sets: {
    slot: "A" | "B";
    label: string;
    neighbours: ClientNeighbour[];
  }[];
  answers: SimilarityAnswers;
};

export type ClientBpmTask = {
  code: string;
  label: string;
  position: number;
  total: number;
  itemPublicCode: string;
  answers: BpmAnswers;
};

export type MusicLabClientBundle = {
  experiment: {
    code: string;
    version: string;
    status: MusicLabExperiment["status"];
    locked: boolean;
  };
  progress: {
    listen: { done: number; total: number };
    similarity: { done: number; total: number };
    bpm: { done: number; total: number };
  };
  listen: ClientListenTask[];
  similarity: ClientSimilarityTask[];
  bpm: ClientBpmTask[];
};

function answersFor(
  responses: readonly MusicLabResponse[],
  taskId: string,
): unknown {
  return responses.find((response) => response.taskId === taskId)?.answers ?? null;
}

function itemCode(items: readonly MusicLabItem[], itemId: string): string | null {
  return items.find((item) => item.id === itemId)?.publicCode ?? null;
}

export function serverOnlyLiterals(input: {
  items: readonly MusicLabItem[];
  tasks: readonly MusicLabTask[];
}): string[] {
  return [
    ...input.items.flatMap((item) => [
      item.externalKey,
      item.sourceFilename,
      item.storagePath,
      item.id,
    ]),
    ...input.tasks.flatMap((task) => [task.id, task.naturalKey, task.subjectItemId]),
  ];
}

export function buildMusicLabClientBundle(input: {
  experiment: MusicLabExperiment;
  items: readonly MusicLabItem[];
  tasks: readonly MusicLabTask[];
  responses: readonly MusicLabResponse[];
}): MusicLabClientBundle {
  const listenTasks = input.tasks.filter((task) => task.taskType === "listen");
  const similarityTasks = input.tasks.filter((task) => task.taskType === "similarity");
  const bpmTasks = input.tasks.filter((task) => task.taskType === "bpm_key");

  const listen = listenTasks.map((task, index) => {
    const raw = answersFor(input.responses, task.id);
    const answers = raw ? normalizeListenAnswers(raw) : emptyListenAnswers();
    return {
      code: task.publicCode,
      label: `Трек ${index + 1}`,
      position: index + 1,
      total: listenTasks.length,
      itemPublicCode: itemCode(input.items, task.subjectItemId) ?? "",
      answers,
    };
  });

  const similarity = similarityTasks.map((task, index) => {
    if (!isSimilarityDefinition(task.definition)) {
      throw new Error("music_lab_similarity_definition_invalid");
    }
    const codes = similarityNeighbourCodes(task.definition);
    const raw = answersFor(input.responses, task.id);
    const answers = raw ? normalizeSimilarityAnswers(raw, codes) : emptySimilarityAnswers();
    return {
      code: task.publicCode,
      label: `Сравнение ${index + 1}`,
      position: index + 1,
      total: similarityTasks.length,
      seedPublicCode: itemCode(input.items, task.subjectItemId) ?? "",
      sets: (["A", "B"] as const).map((slot) => ({
        slot,
        label: slot === "A" ? "Набор A" : "Набор B",
        neighbours: [...task.definition.sets[slot]]
          .sort((left, right) => left.rank - right.rank)
          .map((neighbour) => ({
            publicCode: neighbour.itemPublicCode,
            label: `Вариант ${neighbour.rank}`,
            rank: neighbour.rank,
          })),
      })),
      answers,
    };
  });

  const bpm = bpmTasks.map((task, index) => {
    const raw = answersFor(input.responses, task.id);
    const answers = raw ? normalizeBpmAnswers(raw) : emptyBpmAnswers();
    return {
      code: task.publicCode,
      label: `Трек ${index + 1}`,
      position: index + 1,
      total: bpmTasks.length,
      itemPublicCode: itemCode(input.items, task.subjectItemId) ?? "",
      answers,
    };
  });

  const bundle: MusicLabClientBundle = {
    experiment: {
      code: input.experiment.code,
      version: input.experiment.version,
      status: input.experiment.status,
      locked: input.experiment.status === "completed",
    },
    progress: {
      listen: {
        done: listen.filter((task) => isListenComplete(task.answers)).length,
        total: listen.length,
      },
      similarity: {
        done: similarity.filter((task) =>
          isSimilarityComplete(
            task.answers,
            task.sets.flatMap((set) => set.neighbours.map((neighbour) => neighbour.publicCode)),
          ),
        ).length,
        total: similarity.length,
      },
      bpm: {
        done: bpm.filter((task) => isBpmComplete(task.answers)).length,
        total: bpm.length,
      },
    },
    listen,
    similarity,
    bpm,
  };

  assertMusicLabClientSafe(bundle, serverOnlyLiterals(input));
  return bundle;
}
