import tls from "node:tls";

import type { EmailProvider, EmailProviderMessage, EmailProviderResult } from "../types";
import type { SmtpConfig } from "../smtp-config";

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function sanitizeSmtpResponseLine(line: string): string {
  return line.replace(/[\r\n]+/g, " ").trim();
}

class SmtpSession {
  private buffer = "";

  constructor(private readonly socket: tls.TLSSocket) {}

  async command(expectedCodes: number[], ...lines: string[]): Promise<string> {
    for (const line of lines) {
      this.socket.write(`${line}\r\n`);
    }

    const response = await this.readResponse();

    const code = Number.parseInt(response.slice(0, 3), 10);

    if (!expectedCodes.includes(code)) {
      throw new Error(`SMTP unexpected response: ${sanitizeSmtpResponseLine(response)}`);
    }

    return response;
  }

  private readResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      const onData = (chunk: Buffer | string) => {
        this.buffer += chunk.toString("utf8");

        const lines = this.buffer.split(/\r\n/);

        if (lines.length < 2) {
          return;
        }

        const completeLines = lines.slice(0, -1);
        const lastComplete = completeLines.at(-1);

        if (!lastComplete || lastComplete.length < 4 || lastComplete[3] !== " ") {
          return;
        }

        cleanup();
        resolve(completeLines.join("\r\n"));
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onClose = () => {
        cleanup();
        reject(new Error("SMTP connection closed unexpectedly"));
      };

      const cleanup = () => {
        this.socket.off("data", onData);
        this.socket.off("error", onError);
        this.socket.off("close", onClose);
      };

      this.socket.on("data", onData);
      this.socket.once("error", onError);
      this.socket.once("close", onClose);
      onData("");
    });
  }
}

function buildMimeMessage(message: EmailProviderMessage): string {
  const headers = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: =?UTF-8?B?${encodeBase64(message.subject)}?=`,
    "MIME-Version: 1.0",
  ];

  if (message.replyTo) {
    headers.push(`Reply-To: ${message.replyTo}`);
  }

  if (message.headers) {
    for (const [key, value] of Object.entries(message.headers)) {
      headers.push(`${key}: ${value}`);
    }
  }

  if (message.html && message.text) {
    const boundary = `audiolad-${Date.now()}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

    return [
      ...headers,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeBase64(message.text),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeBase64(message.html),
      `--${boundary}--`,
    ].join("\r\n");
  }

  if (message.html) {
    headers.push("Content-Type: text/html; charset=UTF-8");
    headers.push("Content-Transfer-Encoding: base64");
    return [...headers, "", encodeBase64(message.html)].join("\r\n");
  }

  headers.push("Content-Type: text/plain; charset=UTF-8");
  headers.push("Content-Transfer-Encoding: base64");
  return [...headers, "", encodeBase64(message.text ?? "")].join("\r\n");
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
      socket = await openTlsSocket(this.config);
      const session = new SmtpSession(socket);

      await session.command([220]);
      await session.command([250], `EHLO ${this.config.host}`);
      await session.command([334], "AUTH LOGIN");
      await session.command([334], encodeBase64(this.config.user));
      await session.command([235], encodeBase64(this.config.password));
      await session.command([250], `MAIL FROM:<${this.config.user}>`);
      await session.command([250], `RCPT TO:<${message.to}>`);
      await session.command([354], "DATA");

      const payload = `${buildMimeMessage(message)}\r\n.\r\n`;
      socket.write(payload);
      await session.command([250]);
      await session.command([221], "QUIT");

      return { ok: true };
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
