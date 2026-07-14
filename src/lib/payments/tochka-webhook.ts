import { createPublicKey, verify } from "node:crypto";

const TOCHKA_PUBLIC_KEY_URL =
  "https://enter.tochka.com/doc/openapi/static/keys/public";
const ALLOWED_JWT_ALGORITHM = "RS256";

let cachedPublicKeyPem: string | null = null;

type TochkaJwk = {
  kty: "RSA";
  e: string;
  n: string;
};

type JwtHeader = {
  alg?: string;
};

function base64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0
      ? ""
      : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function jwkToPem(jwk: TochkaJwk): string {
  const keyObject = createPublicKey({
    key: {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
    },
    format: "jwk",
  });

  return keyObject.export({ type: "spki", format: "pem" }).toString();
}

async function getTochkaPublicKeyPem(): Promise<string> {
  if (cachedPublicKeyPem) {
    return cachedPublicKeyPem;
  }

  const response = await fetch(TOCHKA_PUBLIC_KEY_URL, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("tochka_public_key_fetch_failed");
  }

  const jwk = (await response.json()) as TochkaJwk;
  cachedPublicKeyPem = jwkToPem(jwk);
  return cachedPublicKeyPem;
}

function parseJwtHeader(encodedHeader: string): JwtHeader | null {
  try {
    const headerJson = base64UrlToBuffer(encodedHeader).toString("utf8");
    const header = JSON.parse(headerJson) as JwtHeader;
    return header;
  } catch {
    return null;
  }
}

export async function verifyTochkaWebhookJwt(
  jwtToken: string,
): Promise<Record<string, unknown> | null> {
  const parts = jwtToken.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJwtHeader(encodedHeader);

  if (!header || header.alg !== ALLOWED_JWT_ALGORITHM) {
    return null;
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;

  let publicKeyPem: string;

  try {
    publicKeyPem = await getTochkaPublicKeyPem();
  } catch {
    return null;
  }

  const signature = base64UrlToBuffer(encodedSignature);
  const isValid = verify(
    "RSA-SHA256",
    Buffer.from(signingInput),
    publicKeyPem,
    signature,
  );

  if (!isValid) {
    return null;
  }

  try {
    const payloadJson = base64UrlToBuffer(encodedPayload).toString("utf8");
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    return payload;
  } catch {
    return null;
  }
}
