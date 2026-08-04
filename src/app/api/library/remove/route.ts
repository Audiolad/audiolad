import { NextResponse } from "next/server";

import {
  extractRemovePracticeId,
  isRemoveLibraryRpcResult,
  mapRemoveRpcErrorMessage,
  parseJsonObject,
  toRemoveLibrarySuccessBody,
} from "@/lib/library/remove-api";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("remove_library_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsedBody = parseJsonObject(body);

  if (!parsedBody) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const practiceId = extractRemovePracticeId(parsedBody);

  if (!practiceId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("remove_library_practice", {
    p_practice_id: practiceId,
  });

  if (error) {
    const mapped = mapRemoveRpcErrorMessage(error.message);

    if (mapped.status >= 500) {
      console.error("remove_library_rpc_error", error.message);
    }

    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  if (!isRemoveLibraryRpcResult(data)) {
    console.error("remove_library_rpc_empty_result");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(toRemoveLibrarySuccessBody(data), { status: 200 });
}
