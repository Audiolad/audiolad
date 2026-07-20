/**
 * MIME helpers aligned with Timeweb/GoTrue recovery email format.
 */

const QP_SOFT_BREAK = "=\r\n";
const MAX_QP_LINE = 76;

export function encodeMimeWord(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  let encoded = "";

  for (const byte of bytes) {
    const isSafe =
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      (byte >= 0x30 && byte <= 0x39); // 0-9

    if (byte === 0x20) {
      encoded += "_";
    } else if (isSafe) {
      encoded += String.fromCharCode(byte);
    } else {
      encoded += `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }

  return `=?UTF-8?q?${encoded}?=`;
}

export function formatMimeFromAddress(displayName: string | undefined, email: string): string {
  if (!displayName?.trim()) {
    return email;
  }

  return `${encodeMimeWord(displayName.trim())} <${email}>`;
}

export function encodeQuotedPrintable(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n").map(encodeQuotedPrintableLine).join("\r\n");
}

function encodeQuotedPrintableLine(line: string): string {
  let result = "";
  let current = "";

  for (const char of line) {
    const code = char.codePointAt(0) ?? 0;
    let token: string;

    if (
      (code >= 33 && code <= 60) ||
      (code >= 62 && code <= 126)
    ) {
      token = char;
    } else if (char === " " || char === "\t") {
      token = char;
    } else {
      const bytes = Buffer.from(char, "utf8");
      token = [...bytes]
        .map((byte) => `=${byte.toString(16).toUpperCase().padStart(2, "0")}`)
        .join("");
    }

    if (current.length + token.length > MAX_QP_LINE - 1) {
      result += `${current}${QP_SOFT_BREAK}`;
      current = token;
    } else {
      current += token;
    }
  }

  if (current.endsWith(" ")) {
    current = `${current.slice(0, -1)}=20`;
  } else if (current.endsWith("\t")) {
    current = `${current.slice(0, -1)}=09`;
  }

  return `${result}${current}`;
}

export function formatRfc5322Date(date = new Date()): string {
  return date.toUTCString().replace(/GMT$/, "+0000");
}

export function applyDotStuffing(mimeMessage: string): string {
  return mimeMessage
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

export function maxLineLength(value: string): number {
  return value.split(/\r\n|\n/).reduce((max, line) => Math.max(max, line.length), 0);
}

export type BuildHtmlMimeInput = {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  date?: Date;
  /** Prefer omitting Message-ID so Timeweb can assign one (matches recovery). */
  includeMessageId?: boolean;
  messageId?: string;
};

export function buildHtmlQuotedPrintableMime(input: BuildHtmlMimeInput): string {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeMimeWord(input.subject)}`,
    "MIME-Version: 1.0",
    `Date: ${formatRfc5322Date(input.date)}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
  ];

  if (input.replyTo) {
    headers.splice(2, 0, `Reply-To: ${input.replyTo}`);
  }

  if (input.includeMessageId && input.messageId) {
    headers.splice(3, 0, `Message-ID: ${input.messageId}`);
  }

  const body = encodeQuotedPrintable(input.html);
  return [...headers, "", body].join("\r\n");
}
