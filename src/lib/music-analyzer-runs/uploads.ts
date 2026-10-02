import { randomUUID } from "node:crypto";

import {
  buildRunStoragePath,
  openUploadTicket,
  sealUploadTicket,
  sha256Hex,
  uploadTicketExpiry,
  validateUploadDescriptor,
  type MusicAnalyzerUploadIntent,
} from "./policy";
import {
  MusicAnalyzerStorageError,
  createMusicAnalyzerSignedUpload,
  downloadMusicAnalyzerObject,
  enqueueMusicAnalyzerRun,
  getMusicAnalyzerRun,
  removeMusicAnalyzerObject,
} from "./repository";

function ticketSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new MusicAnalyzerStorageError("storage_unavailable");
  return secret;
}

export async function prepareMusicAnalyzerUpload(input: {
  userId: string;
  filename: string;
  byteSize: number;
  mime: string;
  nowMs?: number;
}): Promise<{
  runId: string;
  storagePath: string;
  signedUpload: { path: string; token: string };
  ticket: string;
}> {
  const validated = validateUploadDescriptor({
    filename: input.filename,
    byteSize: input.byteSize,
    mime: input.mime,
  });
  if ("error" in validated) {
    throw new MusicAnalyzerStorageError(validated.error);
  }
  const runId = randomUUID();
  const storagePath = buildRunStoragePath(runId, validated.filename);
  const signedUpload = await createMusicAnalyzerSignedUpload(storagePath);
  const intent: MusicAnalyzerUploadIntent = {
    v: 1,
    userId: input.userId,
    runId,
    storagePath,
    byteSize: input.byteSize,
    mime: validated.mime,
    filename: validated.filename,
    exp: uploadTicketExpiry(input.nowMs ?? Date.now()),
  };
  return {
    runId,
    storagePath,
    signedUpload,
    ticket: sealUploadTicket(intent, ticketSecret()),
  };
}

export async function completeMusicAnalyzerUpload(input: {
  userId: string;
  ticket: string;
  nowMs?: number;
}) {
  const intent = openUploadTicket(input.ticket, ticketSecret(), input.nowMs ?? Date.now());
  if (!intent || intent.userId !== input.userId) {
    throw new MusicAnalyzerStorageError("upload_ticket_invalid");
  }
  const existing = await getMusicAnalyzerRun(intent.runId);
  if (existing) return existing;
  const bytes = await downloadMusicAnalyzerObject(intent.storagePath);
  if (bytes.byteLength !== intent.byteSize) {
    await removeMusicAnalyzerObject(intent.storagePath);
    throw new MusicAnalyzerStorageError("upload_size_mismatch");
  }
  try {
    return await enqueueMusicAnalyzerRun({
      id: intent.runId,
      createdBy: input.userId,
      sourceFilename: intent.filename,
      sha256: sha256Hex(bytes),
      byteSize: bytes.byteLength,
      mimeType: intent.mime,
      storagePath: intent.storagePath,
    });
  } catch (error) {
    await removeMusicAnalyzerObject(intent.storagePath);
    throw error;
  }
}

export async function abandonMusicAnalyzerUpload(input: {
  userId: string;
  ticket: string;
  nowMs?: number;
}): Promise<void> {
  const intent = openUploadTicket(input.ticket, ticketSecret(), input.nowMs ?? Date.now());
  if (!intent || intent.userId !== input.userId) return;
  const existing = await getMusicAnalyzerRun(intent.runId);
  if (existing) return;
  await removeMusicAnalyzerObject(intent.storagePath);
}
