export type MusicAnalyzerRunStatus = "queued" | "processing" | "succeeded" | "failed";

export type MusicAnalyzerRunClient = {
  id: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: MusicAnalyzerRunStatus;
  sourceFilename: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
  versionNumber: number;
  analyzerVersion: string | null;
  analyzerGitCommit: string | null;
  analyzerContentCommit: string | null;
  modelCheckpoint: string | null;
  taxonomyVersion: string | null;
  promptVersion: string | null;
  device: string | null;
  rawJson: unknown;
  normalizedJson: unknown;
  provenance: Record<string, unknown> | null;
  errorCode: string | null;
  attemptCount: number;
};

export type MusicAnalyzerRunRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  status: MusicAnalyzerRunStatus;
  source_filename: string;
  sha256: string;
  byte_size: number | string;
  mime_type: string;
  storage_bucket: string;
  storage_path: string;
  version_number: number;
  analyzer_version: string | null;
  analyzer_git_commit: string | null;
  analyzer_content_commit: string | null;
  model_checkpoint: string | null;
  taxonomy_version: string | null;
  prompt_version: string | null;
  device: string | null;
  raw_json: unknown;
  normalized_json: unknown;
  provenance: unknown;
  error_code: string | null;
  started_at: string | null;
  finished_at: string | null;
  attempt_count: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function toClientRun(
  row: MusicAnalyzerRunRow,
  options: { includePayload?: boolean } = {},
): MusicAnalyzerRunClient {
  const includePayload = options.includePayload === true;
  return {
    id: row.id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    sourceFilename: row.source_filename,
    sha256: row.sha256,
    byteSize: typeof row.byte_size === "number" ? row.byte_size : Number(row.byte_size),
    mimeType: row.mime_type,
    versionNumber: row.version_number,
    analyzerVersion: row.analyzer_version,
    analyzerGitCommit: row.analyzer_git_commit,
    analyzerContentCommit: row.analyzer_content_commit,
    modelCheckpoint: row.model_checkpoint,
    taxonomyVersion: row.taxonomy_version,
    promptVersion: row.prompt_version,
    device: row.device,
    rawJson: includePayload ? row.raw_json ?? null : null,
    normalizedJson: includePayload ? row.normalized_json ?? null : null,
    provenance: includePayload ? asRecord(row.provenance) : null,
    errorCode: row.error_code,
    attemptCount: row.attempt_count,
  };
}

export function sameFileRuns(left: MusicAnalyzerRunClient, right: MusicAnalyzerRunClient): boolean {
  return left.sha256 === right.sha256 && left.id !== right.id;
}
