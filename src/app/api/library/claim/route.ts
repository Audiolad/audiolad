import { NextResponse } from "next/server";

import {
  isClaimFreePracticeRpcResult,
  mapClaimRpcErrorMessage,
  parseJsonObject,
  extractClaimPracticeSlug,
  toClaimLibrarySuccessBody,
} from "@/lib/library/claim-api";
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
    console.error("claim_library_auth_error", authError.message);
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

  const practiceSlug = extractClaimPracticeSlug(parsedBody);

  if (!practiceSlug) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("claim_free_practice", {
    p_practice_slug: practiceSlug,
  });

  if (error) {
    const mapped = mapClaimRpcErrorMessage(error.message);

    if (mapped.status >= 500) {
      console.error("claim_library_rpc_error", error.message);
    }

    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  if (!isClaimFreePracticeRpcResult(data)) {
    console.error("claim_library_rpc_empty_result");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(toClaimLibrarySuccessBody(data), {
    status: data.inserted ? 201 : 200,
  });
}
