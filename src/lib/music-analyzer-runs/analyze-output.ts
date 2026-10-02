const ANALYZER_VERSION_KEYS = ["analyzer_version", "analyzerVersion"] as const;
const TAXONOMY_KEYS = ["taxonomy_version", "taxonomyVersion"] as const;
const PROMPT_KEYS = ["prompt_version", "promptVersion"] as const;

export type AnalyzerOutputHints = {
  analyzerVersion: string | null;
  taxonomyVersion: string | null;
  promptVersion: string | null;
};

export type CollectedAnalyzerOutput = {
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  normalizedSource: string;
  hints: AnalyzerOutputHints;
  outputFiles: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readTopLevelString(documents: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const document of Object.values(documents)) {
    if (!isRecord(document)) continue;
    for (const key of keys) {
      const value = document[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim().slice(0, 200);
      }
    }
  }
  return null;
}

function asObjectDocument(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function collectAnalyzerDocuments(
  files: Record<string, unknown>,
): CollectedAnalyzerOutput {
  const names = Object.keys(files).sort();
  if (names.length === 0) {
    throw new Error("analyzer_output_missing");
  }
  const documents: Record<string, unknown> = {};
  for (const name of names) {
    documents[name] = files[name];
  }
  const raw = { files: documents };
  const normalizedFile = names.find((name) => name.toLowerCase() === "normalized.json")
    ?? names.find((name) => name.toLowerCase().includes("normalized"));
  let normalized = normalizedFile ? asObjectDocument(files[normalizedFile]) : null;
  let normalizedSource = normalizedFile ? `file:${normalizedFile}` : "";

  if (!normalized) {
    for (const name of names) {
      const document = asObjectDocument(files[name]);
      const nested = document ? asObjectDocument(document.normalized) : null;
      if (nested) {
        normalized = nested;
        normalizedSource = `key:${name}.normalized`;
        break;
      }
    }
  }

  if (!normalized) {
    const preferred = names.find((name) => /^(analysis|report)\.json$/i.test(name));
    if (preferred) {
      normalized = asObjectDocument(files[preferred]);
      if (normalized) normalizedSource = `file:${preferred}`;
    }
  }

  if (!normalized && names.length === 1) {
    normalized = asObjectDocument(files[names[0] ?? ""]);
    if (normalized) normalizedSource = `file:${names[0]}`;
  }

  if (!normalized) {
    normalized = raw;
    normalizedSource = "analyzer_documents";
  }

  return {
    raw,
    normalized,
    normalizedSource,
    outputFiles: names,
    hints: {
      analyzerVersion: readTopLevelString(documents, ANALYZER_VERSION_KEYS),
      taxonomyVersion: readTopLevelString(documents, TAXONOMY_KEYS),
      promptVersion: readTopLevelString(documents, PROMPT_KEYS),
    },
  };
}

export function parseAnalyzerJsonFiles(
  files: Array<{ name: string; text: string }>,
  limits: { maxFileBytes: number; maxTotalBytes: number } = {
    maxFileBytes: 8 * 1024 * 1024,
    maxTotalBytes: 20 * 1024 * 1024,
  },
): Record<string, unknown> {
  let total = 0;
  const parsed: Record<string, unknown> = {};
  const jsonFiles = files.filter((file) => file.name.toLowerCase().endsWith(".json"));
  if (jsonFiles.length === 0) {
    throw new Error("analyzer_output_missing");
  }
  for (const file of jsonFiles) {
    if (file.name.includes("/") || file.name.includes("\\") || file.name.includes("..")) {
      throw new Error("analyzer_output_invalid");
    }
    const size = Buffer.byteLength(file.text);
    total += size;
    if (size > limits.maxFileBytes || total > limits.maxTotalBytes) {
      throw new Error("analyzer_output_too_large");
    }
    try {
      parsed[file.name] = JSON.parse(file.text) as unknown;
    } catch {
      throw new Error("analyzer_output_invalid");
    }
  }
  return parsed;
}
