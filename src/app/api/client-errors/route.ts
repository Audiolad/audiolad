import { NextResponse } from "next/server";

import {
  buildClientErrorDedupeKey,
  sanitizeClientErrorReport,
} from "@/lib/client-errors/sanitize";

const MAX_BODY_BYTES = 8_192;
const DEDUPE_WINDOW_MS = 60_000;

type DedupeEntry = {
  reportedAt: number;
};

const recentReports = new Map<string, DedupeEntry>();

function pruneRecentReports(now: number): void {
  for (const [key, entry] of recentReports.entries()) {
    if (now - entry.reportedAt > DEDUPE_WINDOW_MS) {
      recentReports.delete(key);
    }
  }
}

function shouldAcceptReport(dedupeKey: string, now: number): boolean {
  pruneRecentReports(now);

  const previous = recentReports.get(dedupeKey);

  if (previous && now - previous.reportedAt < DEDUPE_WINDOW_MS) {
    return false;
  }

  recentReports.set(dedupeKey, { reportedAt: now });
  return true;
}

export async function POST(request: Request) {
  const rawBody = await request.arrayBuffer();

  if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const report = sanitizeClientErrorReport(parsed);

  if (!report) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const dedupeKey = buildClientErrorDedupeKey(report);

  if (!shouldAcceptReport(dedupeKey, Date.now())) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  console.error(
    "client_error_report",
    JSON.stringify({
      type: report.type,
      message: report.message,
      stack: report.stack,
      source: report.source,
      pathname: report.pathname,
      href: report.href,
      userAgent: report.userAgent,
      online: report.online,
      buildId: report.buildId,
      hasServiceWorker: report.hasServiceWorker,
      timestamp: report.timestamp,
    }),
  );

  return NextResponse.json({ ok: true }, { status: 202 });
}
