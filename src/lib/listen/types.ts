export type ListenTrack = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  durationSeconds: number | null;
  coverImageUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
};

export type ListenProgressEntry = {
  audioItemId: string;
  positionSeconds: number;
  completed: boolean;
};

export type ListenAccessMode = "entitled" | "author_preview";

export type ListenAccess = {
  mode: ListenAccessMode;
};
