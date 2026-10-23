import { createHash } from "node:crypto";

import {
  guestRatingsCaptchaProvider,
  isGuestRatingsProductionEnv,
  isGuestRatingsTestMode,
  type GuestCaptchaProvider,
} from "@/lib/ratings/guest/feature";

export const SMARTCAPTCHA_VALIDATE_URL =
  "https://smartcaptcha.yandexcloud.net/validate";
export const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const VALIDATE_TIMEOUT_MS = 5_000;

type EnvLike = { [key: string]: string | undefined };

export type CaptchaVerifyResult =
  | { ok: true; provider: GuestCaptchaProvider | "test" }
  | {
      ok: false;
      reason:
        | "missing_token"
        | "invalid_token"
        | "provider_unavailable"
        | "not_configured";
    };

export type CaptchaTokenConsume = (tokenHash: string) => Promise<"fresh" | "reused">;

export function hashCaptchaToken(token: string): string {
  return createHash("sha256").update(`guest-captcha:${token}`, "utf8").digest("hex");
}

export function guestCaptchaSiteKey(
  env: EnvLike = process.env,
  provider: GuestCaptchaProvider = guestRatingsCaptchaProvider(env),
): string | null {
  const raw =
    provider === "turnstile"
      ? env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
      : env.NEXT_PUBLIC_YANDEX_SMARTCAPTCHA_CLIENT_KEY;
  const trimmed = raw?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function guestCaptchaServerKey(
  env: EnvLike = process.env,
  provider: GuestCaptchaProvider = guestRatingsCaptchaProvider(env),
): string | null {
  const raw =
    provider === "turnstile"
      ? env.TURNSTILE_SECRET_KEY
      : env.YANDEX_SMARTCAPTCHA_SERVER_KEY;
  const trimmed = raw?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

async function postForm(
  url: string,
  fields: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; json: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody(fields),
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return { ok: true, json: await response.json() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function providerAccepted(
  provider: GuestCaptchaProvider,
  payload: unknown,
): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  if (provider === "smartcaptcha") {
    return "status" in payload && payload.status === "ok";
  }
  return "success" in payload && payload.success === true;
}

/**
 * One-time server validation. Test tokens work only in explicit test mode
 * and never call the provider. A missing key, a bad token, a reused token,
 * or a provider outage fails closed. Registered ratings do not use this.
 */
export async function verifyGuestCaptchaToken(input: {
  token: string | null | undefined;
  ip?: string | null;
  env?: EnvLike;
  fetchImpl?: typeof fetch;
  consumeToken: CaptchaTokenConsume;
}): Promise<CaptchaVerifyResult> {
  const env = input.env ?? process.env;
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!token) {
    return { ok: false, reason: "missing_token" };
  }

  const testMode = isGuestRatingsTestMode(env);
  if (token.startsWith("test:")) {
    if (isGuestRatingsProductionEnv(env) || !testMode) {
      return { ok: false, reason: "invalid_token" };
    }
    if (token === "test:outage") {
      return { ok: false, reason: "provider_unavailable" };
    }
    if (token !== "test:pass") {
      return { ok: false, reason: "invalid_token" };
    }
    const consumed = await input.consumeToken(hashCaptchaToken(token));
    return consumed === "fresh"
      ? { ok: true, provider: "test" }
      : { ok: false, reason: "invalid_token" };
  }

  const provider = guestRatingsCaptchaProvider(env);
  const serverKey = guestCaptchaServerKey(env, provider);
  if (!serverKey) {
    return { ok: false, reason: "not_configured" };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const posted =
    provider === "turnstile"
      ? await postForm(
          TURNSTILE_SITEVERIFY_URL,
          {
            secret: serverKey,
            response: token,
            ...(input.ip && input.ip !== "unknown" ? { remoteip: input.ip } : {}),
          },
          fetchImpl,
        )
      : await postForm(
          SMARTCAPTCHA_VALIDATE_URL,
          {
            secret: serverKey,
            token,
            ...(input.ip && input.ip !== "unknown" ? { ip: input.ip } : {}),
          },
          fetchImpl,
        );

  if (!posted) {
    return { ok: false, reason: "provider_unavailable" };
  }
  if (!providerAccepted(provider, posted.json)) {
    return { ok: false, reason: "invalid_token" };
  }

  const consumed = await input.consumeToken(hashCaptchaToken(token));
  if (consumed !== "fresh") {
    return { ok: false, reason: "invalid_token" };
  }
  return { ok: true, provider };
}
