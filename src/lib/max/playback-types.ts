export type MaxPlaybackMode = "full" | "preview";

export type MaxPlaybackTrack = {
  trackId: string;
  title: string;
  position: number;
  durationSeconds: number | null;
  coverUrl: string | null;
};

export type MaxPlaybackSession = {
  authorSlug: string;
  productSlug: string;
  title: string;
  authorName: string | null;
  formatLabel: string | null;
  coverUrl: string | null;
  tracks: MaxPlaybackTrack[];
  playbackMode: MaxPlaybackMode;
};
