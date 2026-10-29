/** Host-only cookie for the venue device. Never set Domain. */
export const BUSINESS_POINT_COOKIE = "al-point";

/** Pairing code: exactly 4 digits, 0000-9999. Single use, 20 minutes. */
export const BUSINESS_POINT_CODE_RE = /^[0-9]{4}$/;

export const BUSINESS_POINT_CODE_LENGTH = 4;

export const BUSINESS_POINT_TOKEN_RE = /^[0-9a-f]{64}$/;

/** Spaces and dashes typed between digits are ignored: «4 7 1 9» and «47-19» give «4719». */
export function normalizePointCode(value: string): string | null {
  const code = value.replace(/[\s\u2013-]+/g, "");
  return BUSINESS_POINT_CODE_RE.test(code) ? code : null;
}

/** Keeps only digits while typing, at most 4. */
export function pointCodeInput(value: string): string {
  return value.replace(/\D+/g, "").slice(0, BUSINESS_POINT_CODE_LENGTH);
}

/** «4719» shown as «4 7 1 9». */
export function formatPointCode(code: string): string {
  return code.split("").join(" ");
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
