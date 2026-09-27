import { MUSIC_LAB_EXPERIMENT_CODE } from "@/lib/music-lab/constants";
import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabJson } from "@/lib/music-lab/http";
import { signMusicLabObject } from "@/lib/music-lab/sign-audio";
import { createMusicLabRepository } from "@/lib/music-lab/supabase-repository";
import { authorizeMusicLabAudio } from "@/lib/music-lab/workflow";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ experimentCode: string; publicCode: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) {
    return guard.response;
  }

  const { experimentCode, publicCode } = await context.params;
  if (experimentCode !== MUSIC_LAB_EXPERIMENT_CODE) {
    return musicLabJson({ error: "not_found" }, 404);
  }

  const result = await authorizeMusicLabAudio({
    decision: "allow",
    publicCode,
    repository: createMusicLabRepository(),
    sign: signMusicLabObject,
  });
  return musicLabJson(result.body, result.status);
}
