import { NextResponse } from "next/server";

import { musicLabNoStoreHeaders } from "@/lib/music-lab/guard";
import { MusicLabWorkflowError } from "@/lib/music-lab/workflow";

export function musicLabJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: musicLabNoStoreHeaders(),
  });
}

export function musicLabErrorResponse(error: unknown): NextResponse {
  if (error instanceof MusicLabWorkflowError) {
    return musicLabJson(
      {
        error: error.code,
        ...(error.details ? { missing: error.details } : {}),
      },
      error.status,
    );
  }

  if (error instanceof Error && error.message === "music_lab_responses_locked") {
    return musicLabJson({ error: "responses_locked" }, 409);
  }

  console.error("music_lab_request_failed");
  return musicLabJson({ error: "internal_error" }, 500);
}
