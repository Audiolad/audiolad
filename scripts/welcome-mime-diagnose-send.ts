#!/usr/bin/env node
/**
 * One controlled welcome MIME diagnostic send (no deploy).
 * Usage: npx tsx scripts/welcome-mime-diagnose-send.ts
 */
import { readFileSync } from "node:fs";

import { formatMimeFromAddress } from "../src/lib/email/mime";
import { buildWelcomeCompatibleMime } from "../src/lib/email/providers/smtp";
import { sendWelcomeEmail } from "../src/lib/email/send-welcome-email";
import { getSmtpConfigFromEnv } from "../src/lib/email/smtp-config";
import { brandEmailTemplateRenderer } from "../src/lib/email/templates/renderer";
import {
  WELCOME_EMAIL_TEMPLATE_KEY,
  WELCOME_EMAIL_TEMPLATE_VERSION,
} from "../src/lib/email/templates/welcome";

function loadProductionEnv() {
  for (const line of readFileSync("/var/www/audiolad-deploy/shared/.env.production", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function maskEmail(value: string): string {
  const [local, domain] = value.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

function extractHeaders(mime: string): Record<string, string> {
  const headerPart = mime.split("\r\n\r\n")[0] ?? "";
  const headers: Record<string, string> = {};
  for (const line of headerPart.split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers[line.slice(0, idx)] = line.slice(idx + 1).trim();
  }
  return headers;
}

async function main() {
  loadProductionEnv();

  const toEmail = "petpovss@yandex.ru";
  const subject = "АудиоЛад — проверка welcome MIME 2026-07-20";
  const userName = "Сергей";
  const sentAt = new Date();

  const smtp = getSmtpConfigFromEnv();
  if (!smtp) {
    throw new Error("smtp_not_configured");
  }

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: WELCOME_EMAIL_TEMPLATE_KEY,
    templateVersion: WELCOME_EMAIL_TEMPLATE_VERSION,
    payload: { userName },
  });
  if (!rendered.ok) {
    throw new Error("template_render_failed");
  }

  const previewMime = buildWelcomeCompatibleMime({
    from: formatMimeFromAddress("АудиоЛад", smtp.user),
    to: toEmail,
    subject,
    replyTo: "support@audiolad.ru",
    html: rendered.html,
  });
  const headers = extractHeaders(previewMime);

  const result = await sendWelcomeEmail({
    toEmail,
    userName,
    subjectOverride: subject,
  });

  console.log(
    JSON.stringify(
      {
        smtpAccepted: result.ok,
        sentAtUtc: sentAt.toISOString(),
        sentAtMoscow: sentAt.toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
          hour12: false,
        }),
        to: toEmail,
        smtpLogin: maskEmail(smtp.user),
        envelopeFrom: result.ok ? result.envelopeFrom : null,
        from: result.ok ? result.from : headers.From,
        replyTo: headers["Reply-To"] ?? null,
        subject,
        contentType: headers["Content-Type"] ?? null,
        contentTransferEncoding: headers["Content-Transfer-Encoding"] ?? null,
        mimeVersion: headers["MIME-Version"] ?? null,
        dateHeader: headers.Date ?? null,
        messageIdClient: null,
        smtpResponse: result.ok ? result.smtpResponse ?? null : null,
        queueId: result.ok ? result.providerMessageId ?? null : null,
        errorCode: result.ok ? null : result.code,
        note: "Client Message-ID omitted intentionally; Timeweb assigns Message-ID like recovery.",
      },
      null,
      2,
    ),
  );

  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
