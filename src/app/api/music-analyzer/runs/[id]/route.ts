import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabErrorResponse, musicLabJson } from "@/lib/music-lab/http";
import { toClientRun } from "@/lib/music-analyzer-runs/contract";
import { MusicAnalyzerStorageError, getMusicAnalyzerRun } from "@/lib/music-analyzer-runs/repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  try {
    const run = await getMusicAnalyzerRun(id);
    if (!run) return musicLabJson({ error: "not_found" }, 404);
    return musicLabJson({ ok: true, run: toClientRun(run, { includePayload: true }) });
  } catch (error) {
    if (error instanceof MusicAnalyzerStorageError) {
      return musicLabJson({ error: error.code }, 503);
    }
    return musicLabErrorResponse(error);
  }
}
