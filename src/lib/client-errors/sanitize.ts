import {
  CLIENT_ERROR_TYPES,
  type ClientErrorReport,
  type ClientErrorType,
} from "@/lib/client-errors/types";

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2000;
const MAX_SOURCE_LENGTH = 300;
const MAX_PATHNAME_LENGTH = 200;
const MAX_HREF_LENGTH = 500;
const MAX_USER_AGENT_LENGTH = 300;
const MAX_BUILD_ID_LENGTH = 64;

export function classifyClientErrorType(
  message: string,
  stack?: string | null,
): ClientErrorType {
  const text = `${message} ${stack ?? ""}`;

  if (/ChunkLoadError|Loading chunk [\w-]+ failed/i.test(text)) {
    return "chunk_load";
  }

  if (/Failed to fetch dynamically imported module/i.test(text)) {
    return "dynamic_import";
  }

  if (/hydration|Hydration failed|did not match/i.test(text)) {
    return "hydration";
  }

  if (/Failed to find Server Action/i.test(text)) {
    return "server_action";
  }

  if (/Minified React error|rendered more hooks|Maximum update depth/i.test(text)) {
    return "react_render";
  }

  return "other";
}

function trim(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

function sanitizeNullableString(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return trim(value, maxLength);
}

export function sanitizeClientErrorReport(
  input: unknown,
): ClientErrorReport | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const body = input as Record<string, unknown>;
  const message = sanitizeNullableString(body.message, MAX_MESSAGE_LENGTH);

  if (!message) {
    return null;
  }

  const stack = sanitizeNullableString(body.stack, MAX_STACK_LENGTH);
  const source = sanitizeNullableString(body.source, MAX_SOURCE_LENGTH);
  const pathname = sanitizeNullableString(body.pathname, MAX_PATHNAME_LENGTH);
  const href = sanitizeNullableString(body.href, MAX_HREF_LENGTH);
  const userAgent = sanitizeNullableString(body.userAgent, MAX_USER_AGENT_LENGTH);
  const buildId = sanitizeNullableString(body.buildId, MAX_BUILD_ID_LENGTH);

  const rawType =
    typeof body.type === "string" ? body.type.trim() : "other";
  const type = CLIENT_ERROR_TYPES.includes(rawType as ClientErrorType)
    ? (rawType as ClientErrorType)
    : classifyClientErrorType(message, stack);

  const online = body.online === true;
  const hasServiceWorker = body.hasServiceWorker === true;

  const timestamp =
    typeof body.timestamp === "string" && body.timestamp.length > 0
      ? trim(body.timestamp, 40)
      : new Date().toISOString();

  return {
    type,
    message,
    stack,
    source,
    pathname: pathname ?? "/",
    href: href ?? "/",
    userAgent: userAgent ?? "unknown",
    online,
    buildId,
    hasServiceWorker,
    timestamp,
  };
}

export function buildClientErrorDedupeKey(report: ClientErrorReport): string {
  return `${report.type}:${report.pathname}:${report.message}`;
}
