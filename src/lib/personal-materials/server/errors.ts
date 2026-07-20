import { NextResponse } from "next/server";

import { AuthorAccessError, jsonError } from "@/lib/author-products/auth";

export class PersonalMaterialApiError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function mapPersonalMaterialRpcError(message: string): {
  status: number;
  code: string;
} {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { status: 401, code: "unauthorized" };
  }

  if (normalized.includes("forbidden")) {
    return { status: 403, code: "forbidden" };
  }

  if (
    normalized.includes("not_found") ||
    normalized.includes("material_deleted") ||
    normalized.includes("material_unavailable")
  ) {
    return { status: 404, code: "not_found" };
  }

  if (normalized.includes("material_not_editable")) {
    return { status: 409, code: "material_not_editable" };
  }

  if (
    normalized.includes("material_not_ready") ||
    normalized.includes("invalid_client_fields") ||
    normalized.includes("invalid_material_type") ||
    normalized.includes("invalid_token_hash") ||
    normalized.includes("invalid_position")
  ) {
    return { status: 422, code: "invalid_request" };
  }

  if (normalized.includes("guest_access_not_allowed")) {
    return { status: 409, code: "conflict" };
  }

  return { status: 500, code: "internal_error" };
}

export function handlePersonalMaterialRouteError(error: unknown) {
  if (error instanceof AuthorAccessError) {
    if (error.status >= 500) {
      console.error("personal_material_route_error", error.code);
    }

    return jsonError(error.code, error.status);
  }

  if (error instanceof PersonalMaterialApiError) {
    if (error.status >= 500) {
      console.error("personal_material_route_error", error.code);
    }

    return jsonError(error.code, error.status);
  }

  console.error("personal_material_route_unhandled_error", error);
  return jsonError("internal_error", 500);
}

export function guestNotAvailableResponse() {
  return NextResponse.json(
    { error: "MATERIAL_NOT_AVAILABLE" },
    {
      status: 404,
      headers: guestPrivacyHeaders(),
    },
  );
}

export function guestPrivacyHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

export function privateNoStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store",
  };
}
