import { NextResponse } from "next/server";

import { requireMusicLabApiAccess, musicLabNoStoreHeaders } from "@/lib/music-lab/guard";
import { musicLabJson } from "@/lib/music-lab/http";
import { toClientRun } from "@/lib/music-analyzer-runs/contract";
import { exportRunCsv, exportRunJson, exportRunMarkdown } from "@/lib/music-analyzer-runs/export-run";
import { MusicAnalyzerStorageError, getMusicAnalyzerRun } from "@/lib/music-analyzer-runs/repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const guard = await requireMusicLabApiAccess();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get("format");
  try {
    const row = await getMusicAnalyzerRun(id);
    if (!row || row.status !== "succeeded") return musicLabJson({ error: "not_found" }, 404);
    const run = toClientRun(row, { includePayload: true });
    if (format === "csv") {
      return new NextResponse(exportRunCsv(run), {
        headers: {
          ...musicLabNoStoreHeaders(),
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="music-analyzer-${id}.csv"`,
        },
      });
    }
    if (format === "markdown" || format === "md") {
      return new NextResponse(exportRunMarkdown(run), {
        headers: {
          ...musicLabNoStoreHeaders(),
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="music-analyzer-${id}.md"`,
        },
      });
    }
    if (format === "json") {
      return new NextResponse(exportRunJson(run), {
        headers: {
          ...musicLabNoStoreHeaders(),
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="music-analyzer-${id}.json"`,
        },
      });
    }
    return musicLabJson({ error: "export_format" }, 400);
  } catch (error) {
    if (error instanceof MusicAnalyzerStorageError) {
      return musicLabJson({ error: error.code }, 503);
    }
    return musicLabJson({ error: "internal_error" }, 500);
  }
}
