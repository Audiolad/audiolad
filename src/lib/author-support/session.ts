import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import {
  AUTHOR_SUPPORT_COOKIE_NAME,
  AUTHOR_SUPPORT_TTL_SECONDS,
  buildAuthorSupportCookieOptions,
  type AuthorSupportSessionRecord,
} from "./policy";

export type { AuthorSupportSessionRecord };

export function createAuthorSupportToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAuthorSupportToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function authorSupportTokenHashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function readAuthorSupportCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    const value = store.get(AUTHOR_SUPPORT_COOKIE_NAME)?.value;
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

/** Cookie mutation. Call only from a Route Handler or Server Action. */
export async function writeAuthorSupportCookie(token: string): Promise<void> {
  const store = await cookies();
  const options = buildAuthorSupportCookieOptions({
    secure: process.env.NODE_ENV === "production",
    maxAge: AUTHOR_SUPPORT_TTL_SECONDS,
  });
  store.set(options.name, token, {
    httpOnly: options.httpOnly,
    path: options.path,
    sameSite: options.sameSite,
    secure: options.secure,
    maxAge: options.maxAge,
  });
}

/** Cookie mutation. Call only from a Route Handler or Server Action. */
export async function clearAuthorSupportCookie(): Promise<void> {
  const store = await cookies();
  store.set(AUTHOR_SUPPORT_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}
