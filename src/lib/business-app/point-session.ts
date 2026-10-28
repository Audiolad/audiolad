/** Host-only cookie for the venue device. Never set Domain. */
export const BUSINESS_POINT_COOKIE = "al-point";

export const BUSINESS_POINT_CODE_RE = /^[0-9a-f]{10}$/;

export const BUSINESS_POINT_TOKEN_RE = /^[0-9a-f]{64}$/;

export function normalizePointCode(value: string): string | null {
  const code = value.trim().toLowerCase();
  return BUSINESS_POINT_CODE_RE.test(code) ? code : null;
}

export function isPointToken(value: string | null | undefined): value is string {
  return typeof value === "string" && BUSINESS_POINT_TOKEN_RE.test(value);
}

/** Options for the venue cookie. Domain is intentionally absent. */
export function pointCookieOptions(secure: boolean): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 400 * 24 * 60 * 60,
  };
}
