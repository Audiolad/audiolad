// Display helpers for the rightsholder evidence file fields (screenshot / receipt).
// UI only: upload and storage rules live in the form submit flow and the DB RPCs.
import type { RightsholderEvidenceKind } from "@/lib/business-rightsholder/examples";

/** A file that is already stored with the latest submitted attempt (read via a short-lived signed URL). */
export type StoredEvidenceFile = {
  kind: RightsholderEvidenceKind;
  mimeType: string;
  sizeBytes: number;
  createdAt: string | null;
  /** Short-lived signed URL; null when it could not be signed (the file is still listed). */
  url: string | null;
};

/** Submit-time upload state of one slot. */
export type EvidenceUploadState =
  | { phase: "uploading" }
  | { phase: "uploaded" }
  | { phase: "error"; message: string }
  | null;

export const EVIDENCE_SIGNED_URL_TTL_SECONDS = 600;

export const EVIDENCE_COPY = {
  choose: "Выбрать файл",
  replace: "Заменить",
  remove: "Удалить",
  loading: "Загружается…",
  pendingSubmit: "Файл отправится на проверку вместе с заявкой",
  storedHint: "Файл из последней отправленной заявки",
  storedResubmitHint: "Чтобы отправить заявку снова, выберите файл ещё раз – можно тот же",
  previewBroken: "Не удалось открыть изображение – выберите другой файл",
  uploadFailed: "Не удалось загрузить файл – проверьте интернет и отправьте заявку ещё раз",
  storedUnavailable: "Файл сохранён, но предпросмотр сейчас недоступен",
  open: "Открыть",
} as const;

export function isPdfMime(mime: string): boolean {
  return mime === "application/pdf";
}

export function isImageMime(mime: string): boolean {
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/webp";
}

/** «✓ Скриншот загружен» for images, «✓ PDF загружен» for PDF; `earlier` for stored files. */
export function evidenceDoneText(mime: string, earlier = false): string {
  const base = isPdfMime(mime) ? "✓ PDF загружен" : "✓ Скриншот загружен";
  return earlier ? `${base} ранее` : base;
}

export function formatEvidenceSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

export function formatEvidenceDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow" }).format(d);
}

type SnapshotEvidence = { kind: RightsholderEvidenceKind; objectPath: string; mimeType: string; sizeBytes: number; createdAt: string | null };

/**
 * Evidence rows recorded in an attempt snapshot (`snapshot.evidence`, written by
 * author_business_verification_submit_v2). Latest row per kind; unknown shapes are ignored.
 */
export function parseAttemptEvidence(snapshot: unknown): SnapshotEvidence[] {
  const list = (snapshot as { evidence?: unknown } | null)?.evidence;
  if (!Array.isArray(list)) return [];
  const byKind = new Map<RightsholderEvidenceKind, SnapshotEvidence>();
  for (const raw of list) {
    const e = raw as Record<string, unknown> | null;
    if (!e || (e.kind !== "generation" && e.kind !== "paid_period")) continue;
    if (typeof e.object_path !== "string" || !e.object_path || typeof e.mime_type !== "string") continue;
    if (!isImageMime(e.mime_type) && !isPdfMime(e.mime_type)) continue;
    const item: SnapshotEvidence = {
      kind: e.kind,
      objectPath: e.object_path,
      mimeType: e.mime_type,
      sizeBytes: Number(e.size_bytes) || 0,
      createdAt: typeof e.created_at === "string" ? e.created_at : null,
    };
    const prev = byKind.get(item.kind);
    if (!prev || (item.createdAt ?? "") > (prev.createdAt ?? "")) byKind.set(item.kind, item);
  }
  return [...byKind.values()];
}
