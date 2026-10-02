import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabErrorResponse, musicLabJson } from "@/lib/music-lab/http";
import { MUSIC_ANALYZER_RUNS_BUCKET } from "@/lib/music-analyzer-runs/constants";
import { MusicAnalyzerStorageError } from "@/lib/music-analyzer-runs/repository";
import { prepareMusicAnalyzerUpload } from "@/lib/music-analyzer-runs/uploads";

export const dynamic = "force-dynamic";

const CLIENT_ERRORS = new Set(["file_required", "file_too_large", "file_type"]);

export async function POST(request: Request) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  let body: { fileName?: unknown; fileSize?: unknown; mimeType?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return musicLabJson({ error: "file_required" }, 400);
  }
  try {
    const prepared = await prepareMusicAnalyzerUpload({
      userId: guard.actor.userId,
      filename: typeof body.fileName === "string" ? body.fileName : "",
      byteSize: typeof body.fileSize === "number" ? body.fileSize : Number.NaN,
      mime: typeof body.mimeType === "string" ? body.mimeType : "",
    });
    return musicLabJson({
      ok: true,
      runId: prepared.runId,
      bucket: MUSIC_ANALYZER_RUNS_BUCKET,
      signedUpload: prepared.signedUpload,
      ticket: prepared.ticket,
    });
  } catch (error) {
    if (error instanceof MusicAnalyzerStorageError) {
      const status = CLIENT_ERRORS.has(error.code) ? 400 : 503;
      return musicLabJson({ error: error.code }, status);
    }
    return musicLabErrorResponse(error);
  }
}
