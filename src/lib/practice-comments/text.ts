import {
  LISTENER_COMMENT_AUTHOR_PUBLIC_NAME,
  LISTENER_COMMENT_DEFAULT_PUBLIC_NAME,
} from "@/lib/practice-comments/copy";

export const COMMENT_BODY_MIN = 2;
export const COMMENT_BODY_MAX = 2000;
export const COMMENT_NAME_MIN = 2;
export const COMMENT_NAME_MAX = 40;
export const COMMENT_REPORT_DETAILS_MAX = 300;

const PUBLIC_NAME_PATTERN = /^[\p{L}][\p{L}\s.'’-]{0,39}$/u;

export type TextFailure = { ok: false; error: string };
export type TextOk<T> = { ok: true; value: T };

export function commentFingerprint(body: string): string {
  return body.trim().toLocaleLowerCase("ru").replace(/\s+/g, " ");
}

export function parseCommentBody(input: unknown): TextOk<string> | TextFailure {
  if (typeof input !== "string") {
    return { ok: false, error: "invalid_body" };
  }

  const withoutControls = input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();

  if (withoutControls.length < COMMENT_BODY_MIN || withoutControls.length > COMMENT_BODY_MAX) {
    return { ok: false, error: "invalid_body" };
  }

  if (/[<>]/.test(withoutControls) || /<\/?[a-z!]/i.test(withoutControls)) {
    return { ok: false, error: "invalid_body" };
  }

  if (!/\p{L}/u.test(withoutControls)) {
    return { ok: false, error: "invalid_body" };
  }

  const collapsed = withoutControls.replace(/\n{3,}/g, "\n\n");
  return { ok: true, value: collapsed };
}

export function parsePublicCommentName(input: unknown): TextOk<string> | TextFailure {
  if (typeof input !== "string") {
    return { ok: false, error: "invalid_public_name" };
  }

  const name = input.trim().replace(/\s+/g, " ");
  if (
    name.length < COMMENT_NAME_MIN ||
    name.length > COMMENT_NAME_MAX ||
    name.includes("@") ||
    /\d/.test(name) ||
    /[<>]/.test(name) ||
    !PUBLIC_NAME_PATTERN.test(name) ||
    name.split(" ").length > 2
  ) {
    return { ok: false, error: "invalid_public_name" };
  }

  return { ok: true, value: name };
}

/** First given name only. Never an email, never a surname, never a local-part. */
export function deriveDefaultPublicName(fullName: string | null | undefined): string {
  const first = fullName?.trim().split(/\s+/)[0] ?? "";
  const parsed = parsePublicCommentName(first);
  if (!parsed.ok) {
    return LISTENER_COMMENT_DEFAULT_PUBLIC_NAME;
  }
  return parsed.value;
}

/** Workspace name already public on the practice page. Not a listener surname. */
export function parseAuthorReplyName(input: string | null | undefined): string {
  const name = (input ?? "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  if (name.includes("@") || name.length < COMMENT_NAME_MIN) {
    return LISTENER_COMMENT_AUTHOR_PUBLIC_NAME;
  }
  return name.slice(0, COMMENT_NAME_MAX);
}

export function parseReportDetails(input: unknown): TextOk<string | null> | TextFailure {
  if (input == null || input === "") {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return { ok: false, error: "invalid_report" };
  }
  const details = input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (details.length > COMMENT_REPORT_DETAILS_MAX || /[<>]/.test(details)) {
    return { ok: false, error: "invalid_report" };
  }
  return { ok: true, value: details || null };
}

export function parseClientRequestId(input: unknown): TextOk<string | null> | TextFailure {
  if (input == null || input === "") {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return { ok: false, error: "invalid_request_id" };
  }
  const value = input.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  ) {
    return { ok: false, error: "invalid_request_id" };
  }
  return { ok: true, value: value };
}
