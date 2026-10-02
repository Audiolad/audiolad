import { requireMusicLabApiAccess } from "@/lib/music-lab/guard";
import { musicLabErrorResponse, musicLabJson } from "@/lib/music-lab/http";
import { diffJson } from "@/lib/music-analyzer-runs/compare";
import { toClientRun } from "@/lib/music-analyzer-runs/contract";
import { MusicAnalyzerStorageError, getMusicAnalyzerRun } from "@/lib/music-analyzer-runs/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  const url = new URL(request.url);
  const leftId = url.searchParams.get("left") ?? "";
  const rightId = url.searchParams.get("right") ?? "";
  if (!leftId || !rightId || leftId === rightId) {
    return musicLabJson({ error: "compare_pair" }, 400);
  }
  try {
    const [leftRow, rightRow] = await Promise.all([
      getMusicAnalyzerRun(leftId),
      getMusicAnalyzerRun(rightId),
    ]);
    if (!leftRow || !rightRow || leftRow.status !== "succeeded" || rightRow.status !== "succeeded") {
      return musicLabJson({ error: "not_found" }, 404);
    }
    if (leftRow.sha256 !== rightRow.sha256) {
      return musicLabJson({ error: "compare_sha_mismatch" }, 409);
    }
    const left = toClientRun(leftRow, { includePayload: true });
    const right = toClientRun(rightRow, { includePayload: true });
    const diff = diffJson(left.normalizedJson, right.normalizedJson);
    return musicLabJson({
      ok: true,
      sha256: left.sha256,
      left,
      right,
      changes: diff.filter((entry) => entry.state !== "same"),
      sameCount: diff.filter((entry) => entry.state === "same").length,
    });
  } catch (error) {
    if (error instanceof MusicAnalyzerStorageError) {
      return musicLabJson({ error: error.code }, 503);
    }
    return musicLabErrorResponse(error);
  }
}
