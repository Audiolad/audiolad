import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabErrorResponse, musicLabJson } from "@/lib/music-lab/http";
import { createMusicLabRepository } from "@/lib/music-lab/supabase-repository";
import { saveMusicLabResultsSnapshot } from "@/lib/music-lab/workflow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const snapshot = await request.json();
    const result = await saveMusicLabResultsSnapshot({
      repository: createMusicLabRepository(),
      snapshot,
    });
    return musicLabJson(result);
  } catch (error) {
    return musicLabErrorResponse(error);
  }
}
