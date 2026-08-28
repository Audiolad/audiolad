import { NextResponse } from "next/server";

import { AuthorAccessError } from "@/lib/author-products/auth";

import { StudioApiError } from "./validation";

export function studioRouteError(error: unknown, logLabel: string): NextResponse {
  if (error instanceof StudioApiError || error instanceof AuthorAccessError) {
    return NextResponse.json(
      { error: error.code },
      { status: error.status },
    );
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "author_support_audit_failed" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return NextResponse.json(
      { error: "author_support_audit_failed" },
      { status: error.status },
    );
  }
  if (error instanceof Error && error.message === "author_support_proof_missing") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  console.error(logLabel, error);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
