import { NextResponse } from "next/server";

import {
  getIndexNowKeyFileBody,
  matchesConfiguredIndexNowKey,
} from "@/lib/seo/indexnow/config";

export const dynamic = "force-dynamic";

/**
 * Serves IndexNow ownership key as text/plain.
 * Public URL is rewritten from `/{KEY}.txt` → this route with `?key=`.
 * Responds 200 only when the requested key exactly matches INDEXNOW_KEY.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const requestedKey = new URL(request.url).searchParams.get("key");

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
