import { NextResponse } from "next/server";

import { AUTHOR_TERMS_ACCEPTANCE_REQUIRED } from "@/lib/author-terms/types";

export class AuthorTermsAcceptanceRequiredError extends Error {
  readonly status = 403;
  readonly code = AUTHOR_TERMS_ACCEPTANCE_REQUIRED;
  readonly termsVersionId: string;
  readonly termsUrl: string;

  constructor(input: { termsVersionId: string; termsUrl?: string }) {
    super(AUTHOR_TERMS_ACCEPTANCE_REQUIRED);
    this.name = "AuthorTermsAcceptanceRequiredError";
    this.termsVersionId = input.termsVersionId;
    this.termsUrl = input.termsUrl ?? "/author-terms";
  }
}

export function authorTermsAcceptanceRequiredResponse(
  error: AuthorTermsAcceptanceRequiredError,
) {
  return NextResponse.json(
    {
      code: error.code,
      error: error.code,
      termsVersionId: error.termsVersionId,
      termsUrl: error.termsUrl,
    },
    { status: error.status },
  );
}

export class AuthorTermsError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number) {
    super(code);
    this.name = "AuthorTermsError";
    this.code = code;
    this.status = status;
  }
}
