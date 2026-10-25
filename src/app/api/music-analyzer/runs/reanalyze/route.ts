import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabJson, musicLabErrorResponse } from "@/lib/music-lab/http";
import { reanalysisId, reanalysisSelection } from "@/lib/music-analyzer-runs/selective-reanalysis.mjs";
import { record } from "@/lib/music-analyzer-runs/features.mjs";
import { enqueueMusicAnalyzerRun, getMusicAnalyzerRun, copyMusicAnalyzerObject, MusicAnalyzerStorageError } from "@/lib/music-analyzer-runs/repository";
import { buildRunStoragePath } from "@/lib/music-analyzer-runs/audio-file";
import { toClientRun } from "@/lib/music-analyzer-runs/contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) return musicLabJson({ error: "invalid_origin" }, 403);
  try {
    const body = record(await request.json().catch(() => null));
    const ids = reanalysisSelection(body.runIds);
    if (typeof body.requestId !== "string") return musicLabJson({ error: "invalid_selection" }, 400);
    // Проверяем весь список до первой записи; не обходим каталог.
    const plans = [];
    for (const sourceId of ids) {
      const id = reanalysisId(body.requestId, sourceId);
      const source = await getMusicAnalyzerRun(sourceId);
      if (!source || !["succeeded", "failed"].includes(source.status)) return musicLabJson({ error: "source_not_ready", sourceId }, 409);
      plans.push({ id, source });
    }
    const results: Array<{ sourceId: string; run?: ReturnType<typeof toClientRun>; error?: string }> = [];
    for (const { id, source } of plans) {
      try {
        let run = await getMusicAnalyzerRun(id);
        if (!run) {
          const path = buildRunStoragePath(id, source.source_filename);
          await copyMusicAnalyzerObject(source.storage_path, path);
          run = await enqueueMusicAnalyzerRun({ id, createdBy: guard.actor.userId, sourceFilename: source.source_filename, sha256: source.sha256, byteSize: Number(source.byte_size), mimeType: source.mime_type, storagePath: path });
        }
        results.push({ sourceId: source.id, run: toClientRun(run) });
      } catch (error) {
        results.push({ sourceId: source.id, error: error instanceof MusicAnalyzerStorageError ? error.code : "enqueue_failed" });
      }
    }
    return musicLabJson({ ok: results.every(r => !r.error), results });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_selection") return musicLabJson({ error: error.message }, 400);
    return musicLabErrorResponse(error);
  }
}
