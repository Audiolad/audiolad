import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabErrorResponse, musicLabJson } from "@/lib/music-lab/http";
import { createMusicLabRepository } from "@/lib/music-lab/supabase-repository";
import { completeMusicLabExperiment } from "@/lib/music-lab/workflow";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const result = await completeMusicLabExperiment({
      repository: createMusicLabRepository(),
      userId: guard.actor.userId,
    });
    return musicLabJson(result);
  } catch (error) {
    return musicLabErrorResponse(error);
  }
}
