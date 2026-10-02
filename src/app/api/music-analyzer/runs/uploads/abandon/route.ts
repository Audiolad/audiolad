import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabJson } from "@/lib/music-lab/http";
import { abandonMusicAnalyzerUpload } from "@/lib/music-analyzer-runs/uploads";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  let body: { ticket?: unknown } = {};
  try {
    body = await request.json() as typeof body;
  } catch {
    body = {};
  }
  if (typeof body.ticket === "string" && body.ticket) {
    await abandonMusicAnalyzerUpload({
      userId: guard.actor.userId,
      ticket: body.ticket,
    });
  }
  return musicLabJson({ ok: true });
}
