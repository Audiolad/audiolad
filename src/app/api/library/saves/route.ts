import { NextResponse } from "next/server";

import {
  handleCreateLibrarySave,
  handleDeleteLibrarySave,
  handleListLibrarySaves,
} from "@/lib/library/saves-api";
import { createSupabaseLibrarySavesStore } from "@/lib/library/saves";
import { createClientFromRequest } from "@/lib/supabase/request-client";

async function resolveRequestUser(request: Request) {
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("library_saves_auth_error", authError.message);
  }

  return {
    userId: user?.id ?? null,
    store: createSupabaseLibrarySavesStore(supabase),
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
  return request.json();
}

export async function GET(request: Request) {
  const { userId, store } = await resolveRequestUser(request);
  const { searchParams } = new URL(request.url);
  const result = await handleListLibrarySaves({
    userId,
    practiceIdsQuery: searchParams.get("practiceIds"),
    store,
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
  const { userId, store } = await resolveRequestUser(request);

  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await handleCreateLibrarySave({
    userId,
    body,
    store,
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(request: Request) {
  const { userId, store } = await resolveRequestUser(request);

  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await handleDeleteLibrarySave({
    userId,
    body,
    store,
  });

  return NextResponse.json(result.body, { status: result.status });
}
