import { NextResponse } from "next/server";

import {
  coerceStudioMusicAcquireRow,
  mapStudioMusicAcquireRpcError,
  parseStudioMusicAcquireRequest,
  toStudioMusicAcquireSuccessBody,
} from "@/lib/studio-music/acquire-api";
import { parseJsonObject } from "@/lib/studio-music/checkout-api";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return NextResponse.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return noStoreJson({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("studio_music_acquire_auth_error", authError.message);
    return noStoreJson({ error: "internal_error" }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "invalid_request" }, { status: 400 });
  }

  const parsedBody = parseJsonObject(body);

  if (!parsedBody) {
    return noStoreJson({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseStudioMusicAcquireRequest(parsedBody);

  if (!parsed.ok) {
    return noStoreJson({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("acquire_free_studio_music", {
    p_practice_id: parsed.value.practiceId,
  });

  if (error) {
    const mapped = mapStudioMusicAcquireRpcError(error.message);
    if (mapped.status >= 500) {
      console.error("studio_music_acquire_rpc_error", error.message);
    }
    return noStoreJson({ error: mapped.error }, { status: mapped.status });
  }

  const row = coerceStudioMusicAcquireRow(Array.isArray(data) ? data[0] : data);

  if (!row) {
    console.error("studio_music_acquire_invalid_row");
    return noStoreJson({ error: "internal_error" }, { status: 500 });
  }

  return noStoreJson(toStudioMusicAcquireSuccessBody(row), {
    status: row.inserted ? 201 : 200,
  });
}
