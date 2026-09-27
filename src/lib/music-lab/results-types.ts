import type { MusicLabFieldPolicy, MusicLabResultSlotId } from "@/lib/music-lab/types";

export type ResultsSlotView = {
  id: MusicLabResultSlotId;
  title: string;
  text: string | null;
  policyLabel: string | null;
};

export type SimilaritySystemView = {
  label: string;
  mean: number | null;
  numericCount: number;
};

export type MusicLabResultsView =
  | { locked: true }
  | {
      locked: false;
      similarity: SimilaritySystemView[];
      slots: ResultsSlotView[];
      policies: { code: MusicLabFieldPolicy; label: string }[];
    };
