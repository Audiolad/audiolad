import type {
  BpmAnswers,
  ListenAnswers,
  MusicLabAnswers,
  MusicLabTask,
  MusicLabTaskType,
  SimilarityAnswers,
  SimilarityDefinition,
} from "@/lib/music-lab/types";
import {
  COARSE_GENRES,
  COMMENT_LIMIT,
  INSTRUMENTS,
  MOOD_LIMIT,
  MOODS,
  MUSICAL_KEYS,
  OTHER_INSTRUMENT_LIMIT,
  SOUND_CHARACTERS,
  SOUND_LIMIT,
  STYLES,
  VOCAL_ROLES,
} from "@/lib/music-lab/vocabulary";

const GENRE_IDS = new Set<string>(COARSE_GENRES.map((entry) => entry.id));
const STYLE_IDS = new Set<string>(STYLES.map((entry) => entry.id));
const VOCAL_IDS = new Set<string>(VOCAL_ROLES.map((entry) => entry.id));
const INSTRUMENT_IDS = new Set<string>(INSTRUMENTS.map((entry) => entry.id));
const MOOD_IDS = new Set<string>(MOODS.map((entry) => entry.id));
const SOUND_IDS = new Set<string>(SOUND_CHARACTERS.map((entry) => entry.id));
const KEY_IDS = new Set(MUSICAL_KEYS.map((entry) => entry.id));

export class MusicLabAnswerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function emptyListenAnswers(): ListenAnswers {
  return {
    coarseGenre: null,
    styles: [],
    stylesUncertain: false,
    vocalRole: null,
    instruments: [],
    instrumentsOther: "",
    instrumentsUncertain: false,
    moods: [],
    moodsUncertain: false,
    soundCharacter: [],
    soundUncertain: false,
    comment: "",
  };
}

export function emptySimilarityAnswers(): SimilarityAnswers {
  return { scores: {} };
}

export function emptyBpmAnswers(): BpmAnswers {
  return {
    bpm: null,
    bpmUncertain: false,
    key: null,
    keyUncertain: false,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringList(value: unknown, allowed: Set<string>, limit: number): string[] {
  if (!Array.isArray(value)) {
    throw new MusicLabAnswerError("invalid_answers");
  }
  if (value.length > limit) {
    throw new MusicLabAnswerError("invalid_answers");
  }
  const unique: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !allowed.has(entry) || unique.includes(entry)) {
      throw new MusicLabAnswerError("invalid_answers");
    }
    unique.push(entry);
  }
  return unique;
}

function optionalId(value: unknown, allowed: Set<string>): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new MusicLabAnswerError("invalid_answers");
  }
  return value;
}

export function normalizeListenAnswers(value: unknown): ListenAnswers {
  const record = asRecord(value);
  if (!record) {
    throw new MusicLabAnswerError("invalid_answers");
  }

  const stylesUncertain = record.stylesUncertain === true;
  const instrumentsUncertain = record.instrumentsUncertain === true;
  const moodsUncertain = record.moodsUncertain === true;
  const soundUncertain = record.soundUncertain === true;
  const styles = stringList(record.styles ?? [], STYLE_IDS, STYLES.length);
  const instruments = stringList(record.instruments ?? [], INSTRUMENT_IDS, INSTRUMENTS.length);
  const moods = stringList(record.moods ?? [], MOOD_IDS, MOOD_LIMIT);
  const soundCharacter = stringList(
    record.soundCharacter ?? [],
    SOUND_IDS,
    SOUND_LIMIT,
  );
  const instrumentsOther =
    typeof record.instrumentsOther === "string" ? record.instrumentsOther.trim() : "";
  const comment = typeof record.comment === "string" ? record.comment.trim() : "";

  if (instrumentsOther.length > OTHER_INSTRUMENT_LIMIT || comment.length > COMMENT_LIMIT) {
    throw new MusicLabAnswerError("invalid_answers");
  }
  if (stylesUncertain && styles.length > 0) {
    throw new MusicLabAnswerError("invalid_answers");
  }
  if (instrumentsUncertain && (instruments.length > 0 || instrumentsOther.length > 0)) {
    throw new MusicLabAnswerError("invalid_answers");
  }
  if (moodsUncertain && moods.length > 0) {
    throw new MusicLabAnswerError("invalid_answers");
  }
  if (soundUncertain && soundCharacter.length > 0) {
    throw new MusicLabAnswerError("invalid_answers");
  }
  if (instruments.includes("other") && instrumentsOther.length === 0 && !instrumentsUncertain) {
    throw new MusicLabAnswerError("invalid_answers");
  }

  return {
    coarseGenre: optionalId(record.coarseGenre, GENRE_IDS),
    styles,
    stylesUncertain,
    vocalRole: optionalId(record.vocalRole, VOCAL_IDS),
    instruments,
    instrumentsOther,
    instrumentsUncertain,
    moods,
    moodsUncertain,
    soundCharacter,
    soundUncertain,
    comment,
  };
}

export function isListenComplete(answers: ListenAnswers): boolean {
  if (!answers.coarseGenre || !answers.vocalRole) {
    return false;
  }
  if (!answers.stylesUncertain && answers.styles.length === 0) {
    return false;
  }
  if (!answers.instrumentsUncertain && answers.instruments.length === 0) {
    return false;
  }
  if (!answers.moodsUncertain && answers.moods.length === 0) {
    return false;
  }
  if (!answers.soundUncertain && answers.soundCharacter.length === 0) {
    return false;
  }
  return true;
}

export function similarityNeighbourCodes(definition: SimilarityDefinition): string[] {
  return [...definition.sets.A, ...definition.sets.B].map((entry) => entry.itemPublicCode);
}

export function normalizeSimilarityAnswers(
  value: unknown,
  neighbourCodes: readonly string[],
): SimilarityAnswers {
  const record = asRecord(value);
  const scoresRecord = record ? asRecord(record.scores) : null;
  if (!record || !scoresRecord) {
    throw new MusicLabAnswerError("invalid_answers");
  }

  const allowed = new Set(neighbourCodes);
  const scores: SimilarityAnswers["scores"] = {};

  for (const [code, raw] of Object.entries(scoresRecord)) {
    if (!allowed.has(code)) {
      throw new MusicLabAnswerError("invalid_answers");
    }
    const score = asRecord(raw);
    if (!score) {
      throw new MusicLabAnswerError("invalid_answers");
    }
    if (score.uncertain === true) {
      scores[code] = { uncertain: true };
      continue;
    }
    if (
      score.score === 0 ||
      score.score === 1 ||
      score.score === 2 ||
      score.score === 3
    ) {
      scores[code] = { score: score.score };
      continue;
    }
    throw new MusicLabAnswerError("invalid_answers");
  }

  return { scores };
}

export function isSimilarityComplete(
  answers: SimilarityAnswers,
  neighbourCodes: readonly string[],
): boolean {
  return neighbourCodes.every((code) => {
    const score = answers.scores[code];
    if (!score) {
      return false;
    }
    if ("uncertain" in score) {
      return true;
    }
    return score.score >= 0 && score.score <= 3;
  });
}

export function normalizeBpmAnswers(value: unknown): BpmAnswers {
  const record = asRecord(value);
  if (!record) {
    throw new MusicLabAnswerError("invalid_answers");
  }

  const bpmUncertain = record.bpmUncertain === true;
  const keyUncertain = record.keyUncertain === true;
  let bpm: number | null = null;

  if (record.bpm !== null && record.bpm !== undefined && record.bpm !== "") {
    if (typeof record.bpm !== "number" || !Number.isInteger(record.bpm)) {
      throw new MusicLabAnswerError("invalid_answers");
    }
    if (record.bpm < 20 || record.bpm > 300) {
      throw new MusicLabAnswerError("invalid_answers");
    }
    bpm = record.bpm;
  }

  const key = optionalId(record.key, KEY_IDS);
  if (bpmUncertain && bpm !== null) {
    throw new MusicLabAnswerError("invalid_answers");
  }
  if (keyUncertain && key !== null) {
    throw new MusicLabAnswerError("invalid_answers");
  }

  return { bpm, bpmUncertain, key, keyUncertain };
}

export function isBpmComplete(answers: BpmAnswers): boolean {
  const bpmOk = answers.bpmUncertain || answers.bpm !== null;
  const keyOk = answers.keyUncertain || answers.key !== null;
  return bpmOk && keyOk;
}

export function isSimilarityDefinition(
  definition: MusicLabTask["definition"],
): definition is SimilarityDefinition {
  if (!definition || !("sets" in definition)) {
    return false;
  }
  const sets = definition.sets;
  return Array.isArray(sets.A) && Array.isArray(sets.B);
}

export function normalizeTaskAnswers(
  taskType: MusicLabTaskType,
  definition: MusicLabTask["definition"],
  value: unknown,
): MusicLabAnswers {
  if (taskType === "listen") {
    return normalizeListenAnswers(value);
  }
  if (taskType === "bpm_key") {
    return normalizeBpmAnswers(value);
  }
  if (!isSimilarityDefinition(definition)) {
    throw new MusicLabAnswerError("invalid_answers");
  }
  return normalizeSimilarityAnswers(value, similarityNeighbourCodes(definition));
}

export function isTaskComplete(
  task: MusicLabTask,
  answers: MusicLabAnswers | null,
): boolean {
  if (!answers) {
    return false;
  }
  if (task.taskType === "listen") {
    return isListenComplete(answers as ListenAnswers);
  }
  if (task.taskType === "bpm_key") {
    return isBpmComplete(answers as BpmAnswers);
  }
  if (!isSimilarityDefinition(task.definition)) {
    return false;
  }
  return isSimilarityComplete(
    answers as SimilarityAnswers,
    similarityNeighbourCodes(task.definition),
  );
}

export type CompletionReport = {
  ok: boolean;
  missing: {
    listen: number;
    similarity: number;
    bpm: number;
  };
};

export function completionReport(
  tasks: readonly MusicLabTask[],
  answersByTaskId: ReadonlyMap<string, MusicLabAnswers | null>,
): CompletionReport {
  const missing = { listen: 0, similarity: 0, bpm: 0 };

  for (const task of tasks) {
    if (isTaskComplete(task, answersByTaskId.get(task.id) ?? null)) {
      continue;
    }
    if (task.taskType === "listen") {
      missing.listen += 1;
    } else if (task.taskType === "similarity") {
      missing.similarity += 1;
    } else {
      missing.bpm += 1;
    }
  }

  return {
    ok: missing.listen === 0 && missing.similarity === 0 && missing.bpm === 0,
    missing,
  };
}
