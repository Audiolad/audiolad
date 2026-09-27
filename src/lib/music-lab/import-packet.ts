import { randomUUID } from "node:crypto";

import { MUSIC_LAB_BUCKET, MUSIC_LAB_EXPERIMENT_CODE } from "@/lib/music-lab/constants";
import type { BlindKeyMap, ListeningPacket } from "@/lib/music-lab/packet";
import type {
  MusicLabBlindAssignment,
  MusicLabExperiment,
  MusicLabItem,
  MusicLabRepository,
  MusicLabTask,
  SimilarityDefinition,
} from "@/lib/music-lab/types";

export class MusicLabImportError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type MusicLabImportReport = {
  experimentCode: string;
  status: MusicLabExperiment["status"];
  items: number;
  tasks: number;
  blindAssignments: number;
  responsesPreserved: number;
  created: boolean;
};

function extensionFor(filename: string): ".mp3" | ".wav" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".wav")) {
    return ".wav";
  }
  if (lower.endsWith(".mp3")) {
    return ".mp3";
  }
  throw new MusicLabImportError("unsupported_audio_extension");
}

function mimeFor(extension: ".mp3" | ".wav"): string {
  return extension === ".wav" ? "audio/wav" : "audio/mpeg";
}

function allocateCode(prefix: string, used: Set<string>): string {
  let number = 1;
  for (;;) {
    const code = `${prefix}${String(number).padStart(2, "0")}`;
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
    number += 1;
  }
}

function storagePath(publicCode: string, filename: string): string {
  return `${MUSIC_LAB_EXPERIMENT_CODE}/${publicCode}${extensionFor(filename)}`;
}

export async function importListeningPacket(
  repository: MusicLabRepository,
  packet: ListeningPacket,
  options?: { now?: Date },
): Promise<MusicLabImportReport> {
  const now = (options?.now ?? new Date()).toISOString();
  const existing = await repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
  const created = !existing;
  const experiment: MusicLabExperiment = existing
    ? {
        ...existing,
        version: packet.version,
        title: "Музыкальная лаборатория",
      }
    : {
        id: randomUUID(),
        code: MUSIC_LAB_EXPERIMENT_CODE,
        version: packet.version,
        experimentType: "human_listening_validation",
        title: "Музыкальная лаборатория",
        status: "open",
        createdAt: now,
        completedAt: null,
        completedBy: null,
        sourceRefs: { kind: "research_packet", listeningVersion: packet.version },
        payload: { packetCode: MUSIC_LAB_EXPERIMENT_CODE },
        provenance: { importer: "music-lab-v0.1", responsesPolicy: "preserve" },
        resultsSnapshot: null,
      };

  await repository.saveExperiment(experiment);

  const existingItems = await repository.listItems(experiment.id);
  const itemByExternal = new Map(existingItems.map((item) => [item.externalKey, item]));
  const usedItemCodes = new Set(existingItems.map((item) => item.publicCode));
  const orderedExternal: { externalKey: string; filename: string; prefix: "t" | "n" }[] = [];
  const seen = new Set<string>();

  for (const track of packet.listenTracks) {
    if (seen.has(track.trackId)) {
      continue;
    }
    seen.add(track.trackId);
    orderedExternal.push({
      externalKey: track.trackId,
      filename: track.filename,
      prefix: "t",
    });
  }

  for (const [trackId, filename] of packet.filenamesByTrackId) {
    if (seen.has(trackId)) {
      continue;
    }
    seen.add(trackId);
    orderedExternal.push({ externalKey: trackId, filename, prefix: "n" });
  }

  const itemByExternalSaved = new Map<string, MusicLabItem>();
  let sortOrder = 0;
  for (const desired of orderedExternal) {
    const previous = itemByExternal.get(desired.externalKey);
    const publicCode = previous?.publicCode ?? allocateCode(desired.prefix, usedItemCodes);
    usedItemCodes.add(publicCode);
    const extension = extensionFor(desired.filename);
    const item: MusicLabItem = {
      id: previous?.id ?? randomUUID(),
      experimentId: experiment.id,
      externalKey: desired.externalKey,
      publicCode,
      storageBucket: MUSIC_LAB_BUCKET,
      storagePath: storagePath(publicCode, desired.filename),
      sourceFilename: desired.filename,
      mimeType: mimeFor(extension),
      sortOrder: previous?.sortOrder ?? sortOrder,
      createdAt: previous?.createdAt ?? now,
    };
    sortOrder += 1;
    await repository.saveItem(item);
    itemByExternalSaved.set(item.externalKey, item);
  }

  const existingTasks = await repository.listTasks(experiment.id);
  const taskByNatural = new Map(existingTasks.map((task) => [task.naturalKey, task]));
  const usedTaskCodes = new Set(existingTasks.map((task) => task.publicCode));
  const responses = await repository.listResponses(experiment.id);
  const respondedTaskIds = new Set(responses.map((response) => response.taskId));

  const desiredTasks: {
    naturalKey: string;
    taskType: MusicLabTask["taskType"];
    prefix: string;
    subjectExternalKey: string;
    definition: MusicLabTask["definition"];
  }[] = [];

  packet.listenTracks.forEach((track) => {
    desiredTasks.push({
      naturalKey: `listen:${track.trackId}`,
      taskType: "listen",
      prefix: "l",
      subjectExternalKey: track.trackId,
      definition: {},
    });
  });

  packet.similaritySeedIds.forEach((seedId) => {
    const rows = packet.similarityRows.filter((row) => row.seedId === seedId);
    const sets: SimilarityDefinition["sets"] = { A: [], B: [] };
    for (const slot of ["A", "B"] as const) {
      sets[slot] = rows
        .filter((row) => row.slot === slot)
        .sort((left, right) => left.rank - right.rank)
        .map((row) => {
          const item = itemByExternalSaved.get(row.neighbourId);
          if (!item) {
            throw new MusicLabImportError("missing_neighbour_item");
          }
          return { itemPublicCode: item.publicCode, rank: row.rank };
        });
    }
    desiredTasks.push({
      naturalKey: `similarity:${seedId}`,
      taskType: "similarity",
      prefix: "s",
      subjectExternalKey: seedId,
      definition: { sets },
    });
  });

  packet.bpmTracks.forEach((track) => {
    desiredTasks.push({
      naturalKey: `bpm:${track.trackId}`,
      taskType: "bpm_key",
      prefix: "b",
      subjectExternalKey: track.trackId,
      definition: {},
    });
  });

  const desiredNatural = new Set(desiredTasks.map((task) => task.naturalKey));
  for (const task of existingTasks) {
    if (!desiredNatural.has(task.naturalKey) && respondedTaskIds.has(task.id)) {
      throw new MusicLabImportError("import_would_drop_answered_task");
    }
  }

  const savedTasks: MusicLabTask[] = [];
  let taskOrder = 0;
  for (const desired of desiredTasks) {
    const subject = itemByExternalSaved.get(desired.subjectExternalKey);
    if (!subject) {
      throw new MusicLabImportError("missing_subject_item");
    }
    const previous = taskByNatural.get(desired.naturalKey);
    const task: MusicLabTask = {
      id: previous?.id ?? randomUUID(),
      experimentId: experiment.id,
      taskType: desired.taskType,
      naturalKey: desired.naturalKey,
      publicCode: previous?.publicCode ?? allocateCode(desired.prefix, usedTaskCodes),
      sortOrder: previous?.sortOrder ?? taskOrder,
      subjectItemId: subject.id,
      definition: desired.definition,
      createdAt: previous?.createdAt ?? now,
    };
    taskOrder += 1;
    await repository.saveTask(task);
    savedTasks.push(task);
  }

  const responsesAfter = await repository.listResponses(experiment.id);
  return {
    experimentCode: experiment.code,
    status: experiment.status,
    items: (await repository.listItems(experiment.id)).length,
    tasks: savedTasks.length,
    blindAssignments: (await repository.listBlindAssignments(experiment.id)).length,
    responsesPreserved: responsesAfter.length,
    created,
  };
}

export async function importBlindAssignments(
  repository: MusicLabRepository,
  blindBySeed: BlindKeyMap,
): Promise<{ blindAssignments: number }> {
  const experiment = await repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
  if (!experiment) {
    throw new MusicLabImportError("packet_required");
  }

  const tasks = await repository.listTasks(experiment.id);
  const similarityTasks = tasks.filter((task) => task.taskType === "similarity");
  const seedIds = similarityTasks.map((task) => task.naturalKey.slice("similarity:".length));
  const provided = Object.keys(blindBySeed);
  if (
    similarityTasks.length === 0 ||
    seedIds.length !== provided.length ||
    seedIds.some((seedId) => !blindBySeed[seedId])
  ) {
    throw new MusicLabImportError("blind_key_mismatch");
  }

  const responses = await repository.listResponses(experiment.id);
  const existingBlind = await repository.listBlindAssignments(experiment.id);

  for (const task of similarityTasks) {
    const seedId = task.naturalKey.slice("similarity:".length);
    const mapping = blindBySeed[seedId];
    const taskBlind = existingBlind.filter((entry) => entry.taskId === task.id);
    for (const slot of ["A", "B"] as const) {
      const previousBlind = taskBlind.find((entry) => entry.slotCode === slot);
      const systemCode = mapping[slot];
      if (previousBlind && previousBlind.systemCode !== systemCode && responses.length > 0) {
        throw new MusicLabImportError("blind_key_conflict");
      }
      const assignment: MusicLabBlindAssignment = {
        id: previousBlind?.id ?? randomUUID(),
        experimentId: experiment.id,
        taskId: task.id,
        slotCode: slot,
        systemCode,
      };
      await repository.saveBlindAssignment(assignment);
    }
  }

  return {
    blindAssignments: (await repository.listBlindAssignments(experiment.id)).length,
  };
}
