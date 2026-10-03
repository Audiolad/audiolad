import type { MusicAnalyzerStructuredFacts } from "@/lib/music-analyzer-runs/passport";

/** Bump only when the album snapshot shape changes. Old rows stay readable. */
export const ALBUM_PASSPORT_AGGREGATION_VERSION = "album-passport-v1";

export type StoredStructuredFacts = {
  bpm: {
    published: number | null;
    candidate: number | null;
    raw: number | null;
  };
  key: {
    published: string | null;
    published_mode: string | null;
    candidate: string | null;
    candidate_mode: string | null;
  };
  genres: Array<{ label: string; score: number | null }>;
  styles: Array<{ label: string; score: number | null }>;
  moods: Array<{ label: string; score: number | null }>;
  instruments: Array<{ label: string; score: number | null }>;
  sound_character: { label: string; score: number | null } | null;
  loudness_lufs: number | null;
  energy: number | null;
};

export type AlbumPassportSource = {
  outcome: "succeeded" | "failed" | "pending";
  audio_item_id: string;
  track_passport_version_id: string | null;
  music_analyzer_run_id: string | null;
  analyzer_version: string | null;
  analyzer_git_commit: string | null;
};

export type LabelProfileItem = {
  label: string;
  track_passport_version_ids: string[];
  scores: Array<number | null>;
};

export type AlbumPassportDraft = {
  aggregationVersion: typeof ALBUM_PASSPORT_AGGREGATION_VERSION;
  status: "pending" | "completed" | "partial" | "failed";
  analyzerVersion: string;
  analyzerGitCommit: string | null;
  sources: AlbumPassportSource[];
  bpmProfile: {
    published: {
      min: number;
      max: number;
      values: Array<{ value: number; track_passport_version_id: string }>;
    } | null;
    candidates: Array<{ value: number; track_passport_version_id: string }>;
    raw: Array<{ value: number; track_passport_version_id: string }>;
  };
  keyProfile: {
    published: Array<{
      key: string;
      mode: string | null;
      track_passport_version_id: string;
    }>;
    candidates: Array<{
      key: string;
      mode: string | null;
      track_passport_version_id: string;
    }>;
  };
  genreProfile: { items: LabelProfileItem[] };
  styleProfile: { items: LabelProfileItem[] };
  moodProfile: { items: LabelProfileItem[] };
  instrumentProfile: { items: LabelProfileItem[] };
  characterProfile: { items: LabelProfileItem[] };
  sourceFingerprint: string;
};

export type AlbumTrackSnapshot = {
  audioItemId: string;
  passportId: string;
  runId: string;
  analyzerVersion: string | null;
  analyzerGitCommit: string | null;
  facts: StoredStructuredFacts;
};

export type AlbumFailedTrack = {
  audioItemId: string;
  runId: string | null;
};

const ANALYSIS_VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function sanitizeAnalysisVersion(value: string | null | undefined): string {
  const cleaned = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 64);
  if (ANALYSIS_VERSION.test(cleaned)) return cleaned;
  return "snapshot-932c4ce";
}

export function storedFactsFromStructured(
  facts: MusicAnalyzerStructuredFacts,
): StoredStructuredFacts {
  return {
    bpm: {
      published: facts.bpm.published,
      candidate: facts.bpm.candidate,
      raw: facts.bpm.raw,
    },
    key: {
      published: facts.key.published,
      published_mode: facts.key.publishedMode,
      candidate: facts.key.candidate,
      candidate_mode: facts.key.candidateMode,
    },
    genres: facts.genres.map((item) => ({ label: item.label, score: item.score })),
    styles: facts.styles.map((item) => ({ label: item.label, score: item.score })),
    moods: facts.moods.map((item) => ({ label: item.label, score: item.score })),
    instruments: facts.instruments.map((item) => ({ label: item.label, score: item.score })),
    sound_character: facts.soundCharacter
      ? { label: facts.soundCharacter.label, score: facts.soundCharacter.score }
      : null,
    loudness_lufs: facts.loudnessLufs,
    energy: facts.energy,
  };
}

export function parseStoredStructuredFacts(value: unknown): StoredStructuredFacts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<StoredStructuredFacts>;
  if (!record.bpm || typeof record.bpm !== "object" || Array.isArray(record.bpm)) return null;
  if (!record.key || typeof record.key !== "object" || Array.isArray(record.key)) return null;
  return {
    bpm: {
      published: numberOrNull(record.bpm.published),
      candidate: numberOrNull(record.bpm.candidate),
      raw: numberOrNull(record.bpm.raw),
    },
    key: {
      published: textOrNull(record.key.published),
      published_mode: textOrNull(record.key.published_mode),
      candidate: textOrNull(record.key.candidate),
      candidate_mode: textOrNull(record.key.candidate_mode),
    },
    genres: labelList(record.genres),
    styles: labelList(record.styles),
    moods: labelList(record.moods),
    instruments: labelList(record.instruments),
    sound_character: labelOrNull(record.sound_character),
    loudness_lufs: numberOrNull(record.loudness_lufs),
    energy: numberOrNull(record.energy),
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function labelList(value: unknown): Array<{ label: string; score: number | null }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const label = labelOrNull(item);
    return label ? [label] : [];
  });
}

function labelOrNull(value: unknown): { label: string; score: number | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { label?: unknown; score?: unknown };
  const label = textOrNull(record.label);
  if (!label) return null;
  return { label, score: numberOrNull(record.score) };
}

function groupLabels(
  items: Array<{ label: string; score: number | null; passportId: string }>,
): LabelProfileItem[] {
  const grouped = new Map<string, LabelProfileItem>();
  for (const item of items) {
    const label = item.label.trim();
    if (!label) continue;
    const current = grouped.get(label) ?? {
      label,
      track_passport_version_ids: [],
      scores: [],
    };
    if (!current.track_passport_version_ids.includes(item.passportId)) {
      current.track_passport_version_ids.push(item.passportId);
    }
    current.scores.push(item.score);
    grouped.set(label, current);
  }
  return [...grouped.values()].sort((left, right) => (
    right.track_passport_version_ids.length - left.track_passport_version_ids.length
    || left.label.localeCompare(right.label)
  ));
}

function analyzerIdentity(tracks: AlbumTrackSnapshot[]): {
  analyzerVersion: string;
  analyzerGitCommit: string | null;
} {
  const versions = new Set(tracks.map((track) => track.analyzerVersion ?? ""));
  const commits = new Set(tracks.map((track) => track.analyzerGitCommit ?? ""));
  if (tracks.length === 0) {
    return { analyzerVersion: "unknown", analyzerGitCommit: null };
  }
  const version = versions.size === 1 ? (tracks[0]?.analyzerVersion || "unknown") : "mixed";
  const commit = commits.size === 1 ? (tracks[0]?.analyzerGitCommit ?? null) : null;
  return { analyzerVersion: version, analyzerGitCommit: commit };
}

export function albumSourceFingerprint(
  status: AlbumPassportDraft["status"],
  sources: AlbumPassportSource[],
): string {
  const parts = sources
    .map((source) => [
      source.outcome,
      source.audio_item_id,
      source.track_passport_version_id ?? "-",
      source.music_analyzer_run_id ?? "-",
    ].join(":"))
    .sort();
  return `${status}|${parts.join("|")}`.slice(0, 4000);
}

function succeededSources(tracks: AlbumTrackSnapshot[]): AlbumPassportSource[] {
  return tracks.map((track) => ({
    outcome: "succeeded" as const,
    audio_item_id: track.audioItemId,
    track_passport_version_id: track.passportId,
    music_analyzer_run_id: track.runId,
    analyzer_version: track.analyzerVersion,
    analyzer_git_commit: track.analyzerGitCommit,
  }));
}

function failedSources(tracks: AlbumFailedTrack[]): AlbumPassportSource[] {
  return tracks.map((track) => ({
    outcome: "failed" as const,
    audio_item_id: track.audioItemId,
    track_passport_version_id: null,
    music_analyzer_run_id: track.runId,
    analyzer_version: null,
    analyzer_git_commit: null,
  }));
}

export function buildAlbumPassportDraft(input: {
  succeeded: AlbumTrackSnapshot[];
  failed: AlbumFailedTrack[];
  pending?: AlbumPassportSource[];
}): AlbumPassportDraft {
  const pending = input.pending ?? [];
  const known = [
    ...succeededSources(input.succeeded),
    ...failedSources(input.failed),
  ];
  if (pending.length > 0) {
    return emptyDraft("pending", [...known, ...pending], input.succeeded);
  }

  const status: AlbumPassportDraft["status"] = input.succeeded.length === 0
    ? "failed"
    : input.failed.length > 0
      ? "partial"
      : "completed";
  return emptyDraft(status, known, input.succeeded);
}

function emptyDraft(
  status: AlbumPassportDraft["status"],
  sources: AlbumPassportSource[],
  tracks: AlbumTrackSnapshot[],
): AlbumPassportDraft {
  const identity = analyzerIdentity(tracks);
  const publishedBpm = tracks.flatMap((track) => {
    const value = track.facts.bpm.published;
    return value == null ? [] : [{ value, track_passport_version_id: track.passportId }];
  });
  const candidates = tracks.flatMap((track) => {
    const value = track.facts.bpm.candidate;
    return value == null ? [] : [{ value, track_passport_version_id: track.passportId }];
  });
  const raw = tracks.flatMap((track) => {
    const value = track.facts.bpm.raw;
    return value == null ? [] : [{ value, track_passport_version_id: track.passportId }];
  });
  const publishedKeys = tracks.flatMap((track) => {
    const key = track.facts.key.published;
    if (!key) return [];
    return [{
      key,
      mode: track.facts.key.published_mode,
      track_passport_version_id: track.passportId,
    }];
  });
  const candidateKeys = tracks.flatMap((track) => {
    const key = track.facts.key.candidate;
    if (!key) return [];
    return [{
      key,
      mode: track.facts.key.candidate_mode,
      track_passport_version_id: track.passportId,
    }];
  });
  const labels = (
    pick: (facts: StoredStructuredFacts) => Array<{ label: string; score: number | null }>,
  ) => groupLabels(tracks.flatMap((track) => (
    pick(track.facts).map((item) => ({ ...item, passportId: track.passportId }))
  )));
  return {
    aggregationVersion: ALBUM_PASSPORT_AGGREGATION_VERSION,
    status,
    analyzerVersion: identity.analyzerVersion,
    analyzerGitCommit: identity.analyzerGitCommit,
    sources,
    bpmProfile: {
      published: publishedBpm.length === 0
        ? null
        : {
            min: Math.min(...publishedBpm.map((item) => item.value)),
            max: Math.max(...publishedBpm.map((item) => item.value)),
            values: publishedBpm,
          },
      candidates,
      raw,
    },
    keyProfile: {
      published: publishedKeys,
      candidates: candidateKeys,
    },
    genreProfile: { items: labels((facts) => facts.genres) },
    styleProfile: { items: labels((facts) => facts.styles) },
    moodProfile: { items: labels((facts) => facts.moods) },
    instrumentProfile: { items: labels((facts) => facts.instruments) },
    characterProfile: {
      items: labels((facts) => (facts.sound_character ? [facts.sound_character] : [])),
    },
    sourceFingerprint: albumSourceFingerprint(status, sources),
  };
}

export function albumPassportSummaryLines(draft: Pick<
  AlbumPassportDraft,
  "bpmProfile" | "keyProfile" | "genreProfile" | "moodProfile" | "instrumentProfile"
>): string[] {
  const lines: string[] = [];
  const published = draft.bpmProfile.published;
  if (published) {
    lines.push(
      published.min === published.max
        ? `BPM: ${published.min}`
        : `BPM: ${published.min}–${published.max}`,
    );
  }
  if (draft.keyProfile.published.length > 0) {
    lines.push(`Тональности: ${draft.keyProfile.published.map((item) => (
      item.mode ? `${item.key} ${item.mode}` : item.key
    )).join(", ")}`);
  }
  const genres = draft.genreProfile.items.map((item) => item.label);
  if (genres.length > 0) lines.push(`Жанры: ${genres.join(", ")}`);
  const moods = draft.moodProfile.items.map((item) => item.label);
  if (moods.length > 0) lines.push(`Настроение: ${moods.join(", ")}`);
  const instruments = draft.instrumentProfile.items.map((item) => item.label);
  if (instruments.length > 0) lines.push(`Инструменты: ${instruments.join(", ")}`);
  return lines;
}

/**
 * Prompt facts from one frozen album snapshot.
 * Unpublished BPM/key candidates are omitted so the model cannot treat them as fact.
 */
export function albumPassportPromptFacts(draft: AlbumPassportDraft): string {
  const lines = [
    "Музыкальные факты ниже сняты с замороженной версии альбомного паспорта.",
    "Это единственный источник BPM, тональности, жанра, стиля, настроения и инструментов.",
    "Если поля нет в списке, его нет в паспорте: не добавляй и не угадывай его.",
    "Не своди разные значения к одному «верному» ответу.",
  ];
  const published = draft.bpmProfile.published;
  if (published) {
    lines.push(
      published.min === published.max
        ? `Опубликованный BPM: ${published.min}.`
        : `Опубликованный BPM: диапазон ${published.min}–${published.max}. Не выбирай одно число внутри диапазона как единственный темп.`,
    );
  }
  if (draft.keyProfile.published.length > 0) {
    lines.push(`Опубликованные тональности: ${draft.keyProfile.published.map((item) => (
      item.mode && (item.mode === "major" || item.mode === "minor")
        ? `${item.key} ${item.mode}`
        : item.key
    )).join("; ")}.`);
  }
  const section = (title: string, items: LabelProfileItem[]) => {
    if (items.length === 0) return;
    lines.push(`${title}: ${items.map((item) => item.label).join(", ")}.`);
  };
  section("Жанры", draft.genreProfile.items);
  section("Стили", draft.styleProfile.items);
  section("Настроение", draft.moodProfile.items);
  section("Инструменты", draft.instrumentProfile.items);
  section("Характер звука", draft.characterProfile.items);
  if (lines.length === 4) {
    lines.push("Опубликованных музыкальных полей в этой версии паспорта нет.");
  }
  return lines.join("\n");
}

export type PassportAttributeInput = {
  attribute_key: string;
  origin: "measured" | "interpreted";
  value_numeric: number | null;
  value_text: string | null;
  confidence: number | null;
  provenance: "analyzer";
  source_ref: string;
};

const SLUG = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Attribute rows for the existing passport contract.
 * Published BPM is stored only when the analyzer published a number and a
 * 0..1 confidence. Candidates and raw values stay in structured_fields.
 * vocal_role is never emitted.
 */
export function attributesFromStructuredFacts(
  facts: MusicAnalyzerStructuredFacts,
  sourceRef: string,
): PassportAttributeInput[] {
  const ref = sourceRef.slice(0, 200);
  const out: PassportAttributeInput[] = [];
  const bpm = facts.bpm.published;
  if (
    bpm != null
    && facts.bpm.confidence != null
    && bpm >= 20
    && bpm <= 300
  ) {
    out.push({
      attribute_key: "bpm",
      origin: "measured",
      value_numeric: bpm,
      value_text: null,
      confidence: facts.bpm.confidence,
      provenance: "analyzer",
      source_ref: ref,
    });
  }
  const pushTags = (
    key: "genre_class" | "mood" | "instrument",
    items: Array<{ label: string; score: number | null }>,
  ) => {
    const seen = new Set<string>();
    for (const item of items) {
      const label = item.label.trim();
      if (!SLUG.test(label) || seen.has(label)) continue;
      seen.add(label);
      const confidence = item.score != null && item.score >= 0 && item.score <= 1
        ? item.score
        : null;
      out.push({
        attribute_key: key,
        origin: confidence == null ? "interpreted" : "measured",
        value_numeric: null,
        value_text: label,
        confidence,
        provenance: "analyzer",
        source_ref: ref,
      });
    }
  };
  pushTags("genre_class", facts.genres);
  pushTags("mood", facts.moods);
  pushTags("instrument", facts.instruments);
  return out.slice(0, 32);
}

/**
 * An existing description binding stays put. Re-analysis must not move it.
 * The first explicit generation may bind the album version it actually read.
 */
export function nextDescriptionAlbumBinding(input: {
  existingVersionId: string | null;
  generatedFromVersionId: string | null;
}): string | null {
  if (input.existingVersionId) return input.existingVersionId;
  return input.generatedFromVersionId;
}
