import { NextResponse } from "next/server";

import {
  getIndexNowKeyFileBody,
  matchesConfiguredIndexNowKey,
} from "@/lib/seo/indexnow/config";

/**
 * Serves IndexNow ownership key as text/plain.
 * Responds 200 only when the requested key exactly matches INDEXNOW_KEY.
 */
export function buildIndexNowKeyResponse(
  requestedKey: string | null | undefined,
): Response {
  try {
    if (!matchesConfiguredIndexNowKey(requestedKey)) {
      return new NextResponse(null, { status: 404 });
    }

    const body = getIndexNowKeyFileBody();

    if (!body) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
