/**
 * t1578u M4: registry of fingerprint index versions (public.evidence_index_versions, append-only).
 * Fixes which catalog (AL codes + master SHA-256) the matcher used on a given date, so a report
 * made later can be checked against the index that was really in use. Pure helpers.
 */

export const INDEX_VERSION_RE = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$/;
const SHA_RE = /^[0-9a-f]{64}$/;

export type IndexRegistryRow = {
  version: string;
  built_at: string;
  engine_version: string;
  index_json_sha256: string;
  audfprint_sha256: string | null;
  olaf_version: string | null;
  catalog_tracks: number;
  control_tracks: number;
  failed_tracks: number;
  tracks: Array<{ code: string; kind: string; status: string; sha256: string | null }>;
  size_bytes: number | null;
};

export type IndexRegistryEntry = {
  /**
   * registered – already in the registry and the file on disk matches;
   * registered_now – written by this call; mismatch – the registry holds a different index.json;
   * not_on_disk – the version is gone from disk and was never registered; unavailable – no table.
   */
  status: "registered" | "registered_now" | "mismatch" | "not_on_disk" | "unavailable" | "error";
  version: string;
  registered_at: string | null;
  index_json_sha256: string | null;
  audfprint_sha256: string | null;
};

function int(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/** Registry row from the bytes of index.json written by evidence_match.py; null if malformed. */
export function registryRowFromIndex(raw: unknown, indexJsonSha256: string, sizeBytes: number | null): IndexRegistryRow | null {
  if (!raw || typeof raw !== "object" || !SHA_RE.test(indexJsonSha256)) return null;
  const r = raw as Record<string, unknown>;
  const version = String(r.version ?? "");
  const builtAt = String(r.built_at ?? "");
  if (!INDEX_VERSION_RE.test(version) || !Number.isFinite(Date.parse(builtAt))) return null;
  const counts = (r.counts ?? {}) as Record<string, unknown>;
  const audfprint = (r.audfprint ?? {}) as Record<string, unknown>;
  const olaf = (r.olaf ?? {}) as Record<string, unknown>;
  const afp = typeof audfprint.file_sha256 === "string" && SHA_RE.test(audfprint.file_sha256) ? audfprint.file_sha256 : null;
  const tracks = (Array.isArray(r.tracks) ? r.tracks : []).map((t) => {
    const x = (t ?? {}) as Record<string, unknown>;
    return {
      code: String(x.code ?? ""),
      kind: String(x.kind ?? ""),
      status: String(x.status ?? ""),
      sha256: typeof x.sha256 === "string" ? x.sha256 : null,
    };
  });
  return {
    version,
    built_at: builtAt,
    engine_version: String(r.engine_version ?? ""),
    index_json_sha256: indexJsonSha256,
    audfprint_sha256: afp,
    olaf_version: typeof olaf.version === "string" ? olaf.version : null,
    catalog_tracks: int(counts.catalog),
    control_tracks: int(counts.control),
    failed_tracks: int(counts.failed),
    tracks,
    size_bytes: sizeBytes === null ? null : int(sizeBytes),
  };
}

export const REGISTRY_STATUS_TEXT: Record<IndexRegistryEntry["status"], string> = {
  registered: "версия записана в реестр индексов",
  registered_now: "версия записана в реестр индексов",
  mismatch: "ВНИМАНИЕ: файл индекса не совпадает с записью в реестре",
  not_on_disk: "версии нет ни на диске, ни в реестре",
  unavailable: "реестр индексов ещё не включён",
  error: "реестр индексов недоступен",
};
