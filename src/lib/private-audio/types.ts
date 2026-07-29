import type { PrivateAudioSourceType } from "@/lib/private-audio/limits";

export type PrivateAudioItemRow = {
  id: string;
  owner_user_id: string;
  source_type: PrivateAudioSourceType | string;
  title: string;
  author_text: string | null;
  audio_path: string;
  audio_mime_type: string;
  audio_size_bytes: number;
  duration_seconds: number | null;
  original_filename: string | null;
  cover_path: string | null;
  rights_accepted_at: string;
  created_at: string;
  updated_at: string;
};

export type PrivateAudioProgressDto = {
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  updatedAt: string | null;
};

export type PrivateAudioProgressInput = {
  positionSeconds: number;
  durationSeconds?: number | null;
  completed?: boolean;
};

export type PrivateAudioListItemDto = {
  id: string;
  sourceType: string;
  title: string;
  authorText: string | null;
  durationSeconds: number | null;
  audioSizeBytes: number;
  hasCover: boolean;
  coverUrl: string | null;
  progress: PrivateAudioProgressDto;
  createdAt: string;
  updatedAt: string;
};

export type PrivateAudioDetailDto = PrivateAudioListItemDto & {
  originalFilename: string | null;
  rightsAcceptedAt: string;
};

export type PrivateAudioQuotaUsage = {
  itemCount: number;
  totalBytes: number;
  maxItems: number;
  maxTotalBytes: number;
};

export type PrivateAudioSignedAudioDto = {
  url: string;
  expiresAt: string;
};
