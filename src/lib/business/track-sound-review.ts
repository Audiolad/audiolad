export const SOUND_REVIEW_STATUSES = ['unchecked', 'approved', 'rejected'] as const;
export type SoundReviewStatus = (typeof SOUND_REVIEW_STATUSES)[number];
export const SOUND_REVIEW_LABELS: Record<SoundReviewStatus, string> = {
  unchecked: 'Не проверен', approved: 'Допущен', rejected: 'Не допущен',
};
export function isSoundReviewStatus(value: unknown): value is SoundReviewStatus {
  return SOUND_REVIEW_STATUSES.includes(value as SoundReviewStatus);
}
export function soundReviewStatusLabel(row: { status: SoundReviewStatus; sound_auto?: boolean }) {
  if (row.sound_auto && row.status !== 'rejected') return 'Допущен – автодопуск артиста';
  return SOUND_REVIEW_LABELS[row.status];
}
export type SoundReviewRow = {
  id: string; title: string; artist_id: string; artist: string; album_id: string; album: string;
  duration_seconds: number | null; spaces: string[]; audio_identity: string;
  status: SoundReviewStatus; reason: string | null; reviewed_at: string | null; reviewed_by: string | null;
  /** True when the artist's sound auto-admission covers this file. Explicit rejection clears it. */
  sound_auto?: boolean;
};
export type SoundReviewQueue = {
  rows: SoundReviewRow[]; total: number; counts: Record<SoundReviewStatus, number>;
  artists: { id: string; name: string }[]; albums: { id: string; name: string }[];
};
export type SoundReviewHistory = {
  id: number; old_status: SoundReviewStatus; new_status: SoundReviewStatus;
  reason: string | null; changed_at: string; changed_by: string | null; event: string;
};

/** Drop workspaces whose owner is not verified, then apply the queue filters. */
export function restrictSoundQueueToAgreement(
  rows: readonly SoundReviewRow[],
  acceptedAuthorIds: ReadonlySet<string>,
  filter: { status?: string; artist?: string; album?: string; space?: string; page?: number; hiddenAuthorIds?: ReadonlySet<string> },
): SoundReviewQueue & { albumTotal: number | null; artistTotal: number | null } {
  const hidden = filter.hiddenAuthorIds ?? new Set<string>();
  const qualified = rows.filter((row) => acceptedAuthorIds.has(row.artist_id) && !hidden.has(row.artist_id));
  const byName = (left: { name: string; id: string }, right: { name: string; id: string }) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  const artists = [...new Map(qualified.map((row) => [row.artist_id, { id: row.artist_id, name: row.artist }])).values()].sort(byName);
  const albumSource = filter.artist ? qualified.filter((row) => row.artist_id === filter.artist) : qualified;
  const albums = [...new Map(albumSource.map((row) => [row.album_id, { id: row.album_id, name: row.album }])).values()].sort(byName);
  const scoped = qualified.filter((row) => (!filter.artist || row.artist_id === filter.artist)
    && (!filter.album || row.album_id === filter.album)
    && (!filter.space || row.spaces.includes(filter.space)));
  const counts = { unchecked: 0, approved: 0, rejected: 0 } as Record<SoundReviewStatus, number>;
  for (const row of scoped) counts[row.status] += 1;
  const matched = filter.status ? scoped.filter((row) => row.status === filter.status) : scoped;
  const page = Math.max(0, filter.page ?? 0);
  return {
    rows: matched.slice(page * 100, page * 100 + 100),
    total: matched.length,
    counts,
    artists,
    albums,
    albumTotal: filter.album ? qualified.filter((row) => row.album_id === filter.album).length : null,
    artistTotal: filter.artist ? qualified.filter((row) => row.artist_id === filter.artist).length : null,
  };
}

/** Stable wraparound navigation within the current filtered page. */
export function nextUnchecked(rows: readonly SoundReviewRow[], currentId: string | null): string | null {
  const start = rows.findIndex((row) => row.id === currentId);
  for (let offset = 1; offset <= rows.length; offset++) {
    const row = rows[(start + offset) % rows.length];
    if (row.status === 'unchecked' && !row.sound_auto && row.id !== currentId) return row.id;
  }
  return null;
}
