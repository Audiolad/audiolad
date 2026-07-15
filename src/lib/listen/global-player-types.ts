import type { ListenProgressEntry, ListenTrack } from "@/lib/listen/types";

export type GlobalPlayerSession = {
  practiceId: string;
  authorSlug: string;
  productSlug: string;
  practiceTitle: string;
  authorName: string;
  format: string | null;
  tracks: ListenTrack[];
  initialProgress: ListenProgressEntry[];
  coverSymbol: string;
  coverGradient: string;
  coverImageUrl: string | null;
  isAuthorPreview: boolean;
  requestAutoplay?: boolean;
};

export type LoadSessionInput = GlobalPlayerSession;
