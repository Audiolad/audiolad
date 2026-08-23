import { cookies } from "next/headers";

export const PRICE_VISITOR_COOKIE = "audiolad_price_visitor";

const MAX_VISITOR_ID_LENGTH = 64;

const VISITOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export function isPriceVisitorId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_VISITOR_ID_LENGTH &&
    VISITOR_ID_PATTERN.test(value)
  );
}

export function createPriceVisitorId(): string {
  return crypto.randomUUID();
}

export function priceVisitorCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

/** Read-only. Safe in Server Components. */
export async function readPriceVisitorId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(PRICE_VISITOR_COOKIE)?.value;
  return isPriceVisitorId(value) ? value.toLowerCase() : null;
}

/** Cookie mutation. Call only from a Route Handler or Server Action. */
export async function ensurePriceVisitorId(): Promise<string> {
  const existing = await readPriceVisitorId();

  if (existing) {
    return existing;
  }

  const next = createPriceVisitorId();
  const store = await cookies();
  store.set(PRICE_VISITOR_COOKIE, next, priceVisitorCookieOptions());
  return next;
}
