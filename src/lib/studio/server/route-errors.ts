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
  console.error(logLabel, error);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
