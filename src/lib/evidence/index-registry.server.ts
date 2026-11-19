// t1578u M4: writes the fingerprint index version into public.evidence_index_versions (append-only)
// and reports what the registry holds for a version. Best effort: the matcher never depends on it.
import "server-only";

import { isMissingSchemaError } from "@/lib/evidence/ledger";
import { INDEX_VERSION_RE, registryRowFromIndex, type IndexRegistryEntry } from "@/lib/evidence/index-registry";
import { readIndexVersionFile } from "@/lib/evidence/matcher.server";
import { sha256Hex } from "@/lib/evidence/storage.server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type Db = ReturnType<typeof createServiceRoleClient>;

const COLUMNS = "version, index_json_sha256, audfprint_sha256, registered_at";

type Stored = { version: string; index_json_sha256: string; audfprint_sha256: string | null; registered_at: string };

function entry(status: IndexRegistryEntry["status"], version: string, row?: Partial<Stored> | null): IndexRegistryEntry {
  return {
    status,
    version,
    registered_at: row?.registered_at ?? null,
    index_json_sha256: row?.index_json_sha256 ?? null,
    audfprint_sha256: row?.audfprint_sha256 ?? null,
  };
}

async function readStored(db: Db, version: string): Promise<{ row: Stored | null; error: unknown }> {
  const { data, error } = await db.from("evidence_index_versions").select(COLUMNS).eq("version", version).limit(1);
  return { row: ((data ?? [])[0] as Stored | undefined) ?? null, error };
}

/**
 * Registers `version` (null: the active index) if it is not in the registry yet, and checks the
 * file on disk against the registry when it is.
 */
export async function ensureIndexRegistered(db: Db, version: string | null): Promise<IndexRegistryEntry | null> {
  if (version !== null && !INDEX_VERSION_RE.test(version)) return null;
  const file = await readIndexVersionFile(version);
  let raw: unknown = null;
  if (file) {
    try {
      raw = JSON.parse(file.buf.toString("utf8"));
    } catch {
      raw = null;
    }
  }
  const fileSha = file ? sha256Hex(file.buf) : null;
  const row = file && fileSha ? registryRowFromIndex(raw, fileSha, file.sizeBytes) : null;
  const v = version ?? row?.version ?? null;
  if (!v) return null;
  try {
    const first = await readStored(db, v);
    if (first.error) return entry(isMissingSchemaError(first.error) ? "unavailable" : "error", v);
    if (first.row) {
      if (fileSha && first.row.index_json_sha256 !== fileSha) return entry("mismatch", v, first.row);
      return entry("registered", v, first.row);
    }
    if (!row || row.version !== v) return entry("not_on_disk", v);
    const ins = await db.from("evidence_index_versions").insert(row);
    if (ins.error) {
      // A parallel request may have registered it first: read it back.
      const again = await readStored(db, v);
      if (again.row) return entry(again.row.index_json_sha256 === fileSha ? "registered" : "mismatch", v, again.row);
      return entry(isMissingSchemaError(ins.error) ? "unavailable" : "error", v);
    }
    const back = await readStored(db, v);
    return entry("registered_now", v, back.row ?? { index_json_sha256: row.index_json_sha256, audfprint_sha256: row.audfprint_sha256 });
  } catch {
    return entry("error", v);
  }
}

/** Same, with the service-role client; never throws (no env, network): null instead. */
export async function ensureIndexRegisteredSafe(version: string | null, db?: Db): Promise<IndexRegistryEntry | null> {
  try {
    return await ensureIndexRegistered(db ?? createServiceRoleClient(), version);
  } catch {
    return null;
  }
}
