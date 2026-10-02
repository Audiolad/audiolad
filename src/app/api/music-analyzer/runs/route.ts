import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabErrorResponse, musicLabJson } from "@/lib/music-lab/http";
import { toClientRun } from "@/lib/music-analyzer-runs/contract";
import { MusicAnalyzerStorageError, listMusicAnalyzerRuns } from "@/lib/music-analyzer-runs/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  try {
    const runs = await listMusicAnalyzerRuns();
    return musicLabJson({ ok: true, runs: runs.map((run) => toClientRun(run)) });
  } catch (error) {
    if (error instanceof MusicAnalyzerStorageError) {
      return musicLabJson({ error: error.code }, 503);
    }
    return musicLabErrorResponse(error);
  }
}
