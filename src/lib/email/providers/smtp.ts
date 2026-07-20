import tls from "node:tls";

import {
  applyDotStuffing,
  buildHtmlQuotedPrintableMime,
  formatMimeFromAddress,
} from "../mime";
import type { EmailProvider, EmailProviderMessage, EmailProviderResult } from "../types";
import type { SmtpConfig } from "../smtp-config";

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function sanitizeSmtpResponseLine(line: string): string {
  return line.replace(/[\r\n]+/g, " ").trim();
}

function extractProviderMessageId(response: string): string | undefined {
  const sanitized = sanitizeSmtpResponseLine(response);
  const eximMatch = sanitized.match(/\bid=([^\s]+)/i);
  if (eximMatch?.[1]) {
    return eximMatch[1];
  }

  const queueMatch = sanitized.match(/\bqueued as ([^\s]+)/i);
  if (queueMatch?.[1]) {
    return queueMatch[1];
  }

  return undefined;
}

function parseAngleAddress(value: string): string | null {
  const match = value.match(/<([^>]+)>/);
  if (match?.[1]) {
    return match[1].trim().toLowerCase();
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return value.trim().toLowerCase();
  }

  return null;
}

class SmtpSession {
  private buffer = "";

  constructor(private readonly socket: tls.TLSSocket) {
    this.socket.on("data", (chunk: Buffer | string) => {
      this.buffer += chunk.toString("utf8");
    });
  }

  async expect(expectedCodes: number[]): Promise<string> {
    const response = await this.readResponse();
    const code = Number.parseInt(response.slice(0, 3), 10);

    if (!expectedCodes.includes(code)) {
      throw new Error(`SMTP unexpected response: ${sanitizeSmtpResponseLine(response)}`);
    }

    return response;
  }

  async command(expectedCodes: number[], ...lines: string[]): Promise<string> {
    for (const line of lines) {
      this.socket.write(`${line}\r\n`);
    }

    return this.expect(expectedCodes);
  }

  private readResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const lines = this.buffer.split(/\r\n/);

        if (lines.length < 2) {
          return false;
        }

        const completeLines = lines.slice(0, -1);
        const lastComplete = completeLines.at(-1);

        if (!lastComplete || lastComplete.length < 4 || lastComplete[3] !== " ") {
          return false;
        }

        this.buffer = lines.at(-1) ?? "";
        resolve(completeLines.join("\r\n"));
        return true;
      };

      if (check()) {
        return;
      }

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onClose = () => {
        cleanup();
        reject(new Error("SMTP connection closed unexpectedly"));
      };

      const onData = () => {
        if (check()) {
          cleanup();
        }
      };

      const cleanup = () => {
        this.socket.off("data", onData);
        this.socket.off("error", onError);
        this.socket.off("close", onClose);
      };

      this.socket.on("data", onData);
      this.socket.once("error", onError);
      this.socket.once("close", onClose);
    });
  }
}

/**
 * Build welcome/recovery-compatible MIME: single HTML part, quoted-printable.
 * No client Message-ID — Timeweb assigns one (matches working recovery mail).
 */
export function buildWelcomeCompatibleMime(message: EmailProviderMessage): string {
  if (!message.html) {
    throw new Error("html body required for welcome-compatible MIME");
  }

  return buildHtmlQuotedPrintableMime({
    from: message.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    replyTo: message.replyTo,
    includeMessageId: false,
  });
}

async function openTlsSocket(config: SmtpConfig): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: config.host,
        port: config.port,
        servername: config.host,
        rejectUnauthorized: true,
      },
      () => resolve(socket),
    );

    socket.once("error", reject);
  });
}

export class SmtpEmailProvider implements EmailProvider {
  constructor(private readonly config: SmtpConfig) {}

  async send(message: EmailProviderMessage): Promise<EmailProviderResult> {
    let socket: tls.TLSSocket | null = null;

    try {
      const envelopeFrom =
        message.envelopeFrom?.trim().toLowerCase() || this.config.user.toLowerCase();

      socket = await openTlsSocket(this.config);
      const session = new SmtpSession(socket);

      await session.expect([220]);
      await session.command([250], "EHLO audiolad.ru");
      await session.command([334], "AUTH LOGIN");
      await session.command([334], encodeBase64(this.config.user));
      await session.command([235], encodeBase64(this.config.password));
      await session.command([250], `MAIL FROM:<${envelopeFrom}>`);
      await session.command([250], `RCPT TO:<${message.to}>`);
      await session.command([354], "DATA");

      const mime = buildWelcomeCompatibleMime(message);
      const stuffed = applyDotStuffing(mime);
      const payload = `${stuffed}\r\n.\r\n`;
      socket.write(payload);
      const dataResponse = await session.expect([250]);
      await session.command([221], "QUIT");

      return {
        ok: true,
        providerMessageId: extractProviderMessageId(dataResponse),
        smtpResponse: sanitizeSmtpResponseLine(dataResponse),
        envelopeFrom,
      };
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unknown SMTP transport error";

      return {
        ok: false,
        code: "smtp_send_failed",
        message: messageText,
        retryable: true,
      };
    } finally {
      socket?.end();
    }
  }
}

export function createSmtpEmailProvider(config: SmtpConfig): SmtpEmailProvider {
  return new SmtpEmailProvider(config);
}

export { formatMimeFromAddress, parseAngleAddress };
