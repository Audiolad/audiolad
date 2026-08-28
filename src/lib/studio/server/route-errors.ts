import { NextResponse } from "next/server";

import { AuthorAccessError } from "@/lib/author-products/auth";

import { StudioApiError } from "./validation";

function isCodedHttpError(
  error: unknown,
): error is { code: string; status: number } {
  if (error instanceof StudioApiError || error instanceof AuthorAccessError) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: unknown; status?: unknown };
  return (
    typeof candidate.code === "string" &&
    typeof candidate.status === "number" &&
    Number.isInteger(candidate.status) &&
    candidate.status >= 400 &&
    candidate.status <= 599
  );
}

export function studioRouteError(error: unknown, logLabel: string): NextResponse {
  if (isCodedHttpError(error)) {
    return NextResponse.json(
      { error: error.code },
      { status: error.status },
    );
  }
  if (error instanceof Error && error.message === "author_support_proof_missing") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  console.error(logLabel, error);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
