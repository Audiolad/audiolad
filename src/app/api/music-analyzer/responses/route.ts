import { musicLabErrorResponse, musicLabJson } from "@/lib/music-lab/http";
import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { createMusicLabRepository } from "@/lib/music-lab/supabase-repository";
import { saveMusicLabResponse } from "@/lib/music-lab/workflow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const body = (await request.json()) as { taskCode?: unknown; answers?: unknown };
    if (typeof body.taskCode !== "string") {
      return musicLabJson({ error: "invalid_answers" }, 400);
    }
    const result = await saveMusicLabResponse({
      repository: createMusicLabRepository(),
      userId: guard.actor.userId,
      taskCode: body.taskCode,
      answers: body.answers,
    });
    return musicLabJson(result);
  } catch (error) {
    return musicLabErrorResponse(error);
  }
}
