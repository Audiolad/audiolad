import { createHmac, timingSafeEqual } from "node:crypto";

type VerifyWebhookInput = {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  secret: string;
  maxAgeSeconds?: number;
};

function decodeHookSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const whsecPrefix = "whsec_";
  const v1Prefix = "v1,";

  let payload = trimmed;

  if (payload.startsWith(v1Prefix)) {
    payload = payload.slice(v1Prefix.length);
  }

  if (payload.startsWith(whsecPrefix)) {
    payload = payload.slice(whsecPrefix.length);
  }

  return Buffer.from(payload, "base64");
}

function parseSignatureHeader(header: string): string[] {
  return header
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith("v1,") ? part.slice(3) : part));
}

export function verifyStandardWebhookSignature(
  input: VerifyWebhookInput,
): boolean {
  const {
    rawBody,
    webhookId,
    webhookTimestamp,
    webhookSignature,
    secret,
    maxAgeSeconds = 300,
  } = input;

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return false;
  }

  const timestamp = Number(webhookTimestamp);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestamp) > maxAgeSeconds) {
    return false;
  }

  const key = decodeHookSecret(secret);
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");
  const candidates = parseSignatureHeader(webhookSignature);

  return candidates.some((candidate) => {
    try {
      const left = Buffer.from(candidate);
      const right = Buffer.from(expected);

      return left.length === right.length && timingSafeEqual(left, right);
    } catch {
      return false;
    }
  });
}

export function getAuthHookSecretFromEnv(): string | null {
  const secret = process.env.AUDIOLAD_AUTH_HOOK_SECRET?.trim();

  return secret || null;
}
