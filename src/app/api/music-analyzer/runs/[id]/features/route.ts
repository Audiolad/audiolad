import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabJson, musicLabErrorResponse } from "@/lib/music-lab/http";
import { appendRunFeatureOverride, getRunFeatures } from "@/lib/music-analyzer-runs/feature-overrides";
import { MusicAnalyzerStorageError } from "@/lib/music-analyzer-runs/repository";
import { record } from "@/lib/music-analyzer-runs/features.mjs";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };

function failure(error: unknown) {
  if (error instanceof MusicAnalyzerStorageError) return musicLabJson({ error: error.code }, 503);
  if (error instanceof Error && error.message === "invalid_override") return musicLabJson({ error: error.message }, 400);
  if (error instanceof Error && error.message === "features_not_found") return musicLabJson({ error: error.message }, 404);
  return musicLabErrorResponse(error);
}

export async function GET(_request: Request, context: Context) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return musicLabJson({ error: "invalid_run_id" }, 400);
  try {
    const result = await getRunFeatures(id);
    return result ? musicLabJson({ ok: true, ...result }) : musicLabJson({ error: "features_not_found" }, 404);
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  if (request.headers.get("origin") !== new URL(request.url).origin) return musicLabJson({ error: "invalid_origin" }, 403);
  const { id } = await context.params;
  if (!UUID.test(id)) return musicLabJson({ error: "invalid_run_id" }, 400);
  try {
    const body = record(await request.json().catch(() => null));
    const result = await appendRunFeatureOverride({ runId: id, userId: guard.actor.userId, patch: body.patch, reason: body.reason });
    return musicLabJson({ ok: true, ...result });
  } catch (error) { return failure(error); }
}
