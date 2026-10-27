export const SOUND_REVIEW_STATUSES = ['unchecked', 'approved', 'rejected'] as const;
export type SoundReviewStatus = (typeof SOUND_REVIEW_STATUSES)[number];
export const SOUND_REVIEW_LABELS: Record<SoundReviewStatus, string> = {
  unchecked: 'Не проверен', approved: 'Допущен', rejected: 'Не допущен',
};
export function isSoundReviewStatus(value: unknown): value is SoundReviewStatus {
  return SOUND_REVIEW_STATUSES.includes(value as SoundReviewStatus);
}
export type SoundReviewRow = {
  id: string; title: string; artist_id: string; artist: string; album_id: string; album: string;
  duration_seconds: number | null; spaces: string[]; audio_identity: string;
  status: SoundReviewStatus; reason: string | null; reviewed_at: string | null; reviewed_by: string | null;
};
export type SoundReviewQueue = {
  rows: SoundReviewRow[]; total: number; counts: Record<SoundReviewStatus, number>;
  artists: { id: string; name: string }[]; albums: { id: string; name: string }[];
};
export type SoundReviewHistory = {
  id: number; old_status: SoundReviewStatus; new_status: SoundReviewStatus;
  reason: string | null; changed_at: string; changed_by: string | null; event: string;
};

/** Stable wraparound navigation within the current filtered page. */
export function nextUnchecked(rows: readonly SoundReviewRow[], currentId: string | null): string | null {
  const start = rows.findIndex((row) => row.id === currentId);
  for (let offset = 1; offset <= rows.length; offset++) {
    const row = rows[(start + offset) % rows.length];
    if (row.status === 'unchecked' && row.id !== currentId) return row.id;
  }
  return null;
}
