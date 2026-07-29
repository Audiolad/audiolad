import { NextResponse } from "next/server";

export class PrivateAudioApiError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function privateNoStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

export function handlePrivateAudioRouteError(error: unknown): NextResponse {
  if (error instanceof PrivateAudioApiError) {
    if (error.status >= 500) {
      console.error("private_audio_route_error", error.code);
    }

    return NextResponse.json(
      { error: error.code },
      { status: error.status, headers: privateNoStoreHeaders() },
    );
  }

  console.error("private_audio_route_error", error);

  return NextResponse.json(
    { error: "internal_error" },
    { status: 500, headers: privateNoStoreHeaders() },
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
