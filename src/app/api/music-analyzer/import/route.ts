import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabErrorResponse, musicLabJson } from "@/lib/music-lab/http";
import { MusicLabImportError } from "@/lib/music-lab/import-packet";
import { createMusicLabRepository } from "@/lib/music-lab/supabase-repository";
import { importBundledListeningPacket } from "@/lib/music-lab/workflow";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const report = await importBundledListeningPacket(createMusicLabRepository());
    return musicLabJson({
      ok: true,
      status: report.status,
      items: report.items,
      tasks: report.tasks,
      responsesPreserved: report.responsesPreserved,
    });
  } catch (error) {
    if (error instanceof MusicLabImportError) {
      return musicLabJson({ error: error.code }, 409);
    }
    return musicLabErrorResponse(error);
  }
}
