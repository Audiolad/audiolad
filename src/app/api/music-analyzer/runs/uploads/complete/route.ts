import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabErrorResponse, musicLabJson } from "@/lib/music-lab/http";
import { toClientRun } from "@/lib/music-analyzer-runs/contract";
import { MusicAnalyzerStorageError } from "@/lib/music-analyzer-runs/repository";
import { completeMusicAnalyzerUpload } from "@/lib/music-analyzer-runs/uploads";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  let body: { ticket?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return musicLabJson({ error: "upload_ticket_invalid" }, 400);
  }
  if (typeof body.ticket !== "string" || !body.ticket) {
    return musicLabJson({ error: "upload_ticket_invalid" }, 400);
  }
  try {
    const run = await completeMusicAnalyzerUpload({
      userId: guard.actor.userId,
      ticket: body.ticket,
    });
    return musicLabJson({ ok: true, run: toClientRun(run) });
  } catch (error) {
    if (error instanceof MusicAnalyzerStorageError) {
      const status = error.code === "upload_ticket_invalid" || error.code === "upload_size_mismatch" ? 400 : 503;
      return musicLabJson({ error: error.code }, status);
    }
    return musicLabErrorResponse(error);
  }
}
