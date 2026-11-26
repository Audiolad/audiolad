import { createHash, createHmac } from "node:crypto";

export type S3SigningConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  forcePathStyle?: boolean;
};

const AWS_ALGORITHM = "AWS4-HMAC-SHA256";
const AWS_SERVICE = "s3";

function awsEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) => (
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    ));
}

function canonicalPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => awsEncode(decodeURIComponent(segment)))
    .join("/");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, AWS_SERVICE);
  return hmac(serviceKey, "aws4_request");
}

function amzDate(now: Date): { timestamp: string; date: string } {
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { timestamp, date: timestamp.slice(0, 8) };
}

export function buildS3ObjectUrl(
  config: Pick<S3SigningConfig, "endpoint" | "forcePathStyle">,
  bucket: string,
  key: string,
): URL {
  const endpoint = new URL(config.endpoint);
  const encodedKey = key.split("/").map(awsEncode).join("/");
  if (config.forcePathStyle !== false) {
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${awsEncode(bucket)}/${encodedKey}`;
  } else {
    endpoint.hostname = `${bucket}.${endpoint.hostname}`;
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${encodedKey}`;
  }
  return endpoint;
}

export function presignS3ObjectUrl(input: {
  config: S3SigningConfig;
  bucket: string;
  key: string;
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  expiresSeconds: number;
  now?: Date;
}): string {
  const expiresSeconds = Math.max(1, Math.min(604800, Math.floor(input.expiresSeconds)));
  const now = input.now ?? new Date();
  const { timestamp, date } = amzDate(now);
  const scope = `${date}/${input.config.region}/${AWS_SERVICE}/aws4_request`;
  const url = buildS3ObjectUrl(input.config, input.bucket, input.key);
  url.searchParams.set("X-Amz-Algorithm", AWS_ALGORITHM);
  url.searchParams.set("X-Amz-Credential", `${input.config.accessKeyId}/${scope}`);
  url.searchParams.set("X-Amz-Date", timestamp);
  url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
  url.searchParams.set("X-Amz-SignedHeaders", "host");
  if (input.config.sessionToken) {
    url.searchParams.set("X-Amz-Security-Token", input.config.sessionToken);
  }

  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey === rightKey
        ? (leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0)
        : (leftKey < rightKey ? -1 : 1)
    ))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
  const canonicalRequest = [
    input.method,
    canonicalPath(url.pathname),
    canonicalQuery,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    AWS_ALGORITHM,
    timestamp,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(
    input.config.secretAccessKey,
    date,
    input.config.region,
  )).update(stringToSign, "utf8").digest("hex");
  url.searchParams.set("X-Amz-Signature", signature);
  return url.toString();
}
