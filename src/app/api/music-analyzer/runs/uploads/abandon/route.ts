import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabJson } from "@/lib/music-lab/http";
import { readSignedUploadClientReport } from "@/lib/music-analyzer-runs/browser-upload";
import { abandonMusicAnalyzerUpload } from "@/lib/music-analyzer-runs/uploads";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  let body: { ticket?: unknown; storageError?: unknown } = {};
  try {
    body = await request.json() as typeof body;
  } catch {
    body = {};
  }
  const storageError = readSignedUploadClientReport(body.storageError);
  if (storageError) {
    console.error("music-analyzer browser upload rejected", {
      code: storageError.code,
      status: storageError.status,
      statusCode: storageError.statusCode,
      message: storageError.message,
    });
  }
  if (typeof body.ticket === "string" && body.ticket) {
    await abandonMusicAnalyzerUpload({
      userId: guard.actor.userId,
      ticket: body.ticket,
    });
  }
  return musicLabJson({ ok: true });
}
