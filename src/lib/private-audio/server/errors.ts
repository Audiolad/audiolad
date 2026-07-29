import { NextResponse } from "next/server";

import {
  logPrivateAudioFailure,
  type PrivateAudioStage,
} from "@/lib/private-audio/server/logging";

export class PrivateAudioApiError extends Error {
  status: number;
  code: string;
  stage: PrivateAudioStage | "unknown";
  opId: string | null;

  constructor(
    code: string,
    status: number,
    options?: {
      stage?: PrivateAudioStage | "unknown";
      opId?: string | null;
    },
  ) {
    super(code);
    this.code = code;
    this.status = status;
    this.stage = options?.stage ?? "unknown";
    this.opId = options?.opId ?? null;
  }
}

export function privateNoStoreHeaders(opId?: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };

  if (opId) {
    headers["X-Audiolad-Op-Id"] = opId;
  }

  return headers;
}

export function handlePrivateAudioRouteError(
  error: unknown,
  opId?: string | null,
): NextResponse {
  if (error instanceof PrivateAudioApiError) {
    const resolvedOpId = error.opId ?? opId ?? null;

    logPrivateAudioFailure({
      opId: resolvedOpId ?? "PA-NONE",
      stage: error.stage,
      code: error.code,
      status: error.status,
    });

    return NextResponse.json(
      {
        error: error.code,
        ...(resolvedOpId ? { opId: resolvedOpId } : {}),
      },
      { status: error.status, headers: privateNoStoreHeaders(resolvedOpId) },
    );
  }

  const resolvedOpId = opId ?? null;

  logPrivateAudioFailure({
    opId: resolvedOpId ?? "PA-NONE",
    stage: "unknown",
    code: "internal_error",
    status: 500,
  });

  return NextResponse.json(
    {
      error: "internal_error",
      ...(resolvedOpId ? { opId: resolvedOpId } : {}),
    },
    { status: 500, headers: privateNoStoreHeaders(resolvedOpId) },
  );
}

export function mapPrivateAudioRpcError(message: string): {
  status: number;
  code: string;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, code: "unauthorized" };
  }

  if (normalized.includes("not_found")) {
    return { status: 404, code: "not_found" };
  }

  if (normalized.includes("invalid_position")) {
    return { status: 422, code: "invalid_request" };
  }

  return { status: 500, code: "internal_error" };
}

export { getPrivateAudioErrorMessage } from "@/lib/private-audio/error-messages";
