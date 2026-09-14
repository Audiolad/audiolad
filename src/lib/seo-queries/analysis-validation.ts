import {
  SEO_QUERY_AUDIO_FITS,
  SEO_QUERY_FORMATS,
  SEO_QUERY_INTENTS,
  type SeoQueryAudioFit,
  type SeoQueryDisposition,
  type SeoQueryFormat,
  type SeoQueryIntent,
} from "./analysis-taxonomy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SEO_QUERY_ANALYSIS_MAX_ITEMS = 20;

export type SeoQueryApplyItem = {
  id: string;
  intent: SeoQueryIntent;
  recommendedFormat: SeoQueryFormat | null;
  audioFit: SeoQueryAudioFit;
  analysisStatus: SeoQueryDisposition;
};

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Validates and deduplicates IDs while preserving the first submitted order. */
export function parseSeoQueryIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > SEO_QUERY_ANALYSIS_MAX_ITEMS) return null;
  const ids = [...new Set(value)];
  return ids.every((id) => typeof id === "string" && UUID.test(id)) ? ids : null;
}

export function validateSeoQueryApplyItem(value: unknown): SeoQueryApplyItem | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const ids = parseSeoQueryIds([input.id]);
  const intent = nullableString(input.intent);
  const recommendedFormat = nullableString(input.recommended_format);
  const audioFit = nullableString(input.audio_fit);
  const analysisStatus = input.analysis_status;
  if (
    !ids || intent === undefined || !SEO_QUERY_INTENTS.includes(intent as SeoQueryIntent)
    || recommendedFormat === undefined || (recommendedFormat !== null && !SEO_QUERY_FORMATS.includes(recommendedFormat as SeoQueryFormat))
    || audioFit === undefined || !SEO_QUERY_AUDIO_FITS.includes(audioFit as SeoQueryAudioFit)
    || (analysisStatus !== "analyzed" && analysisStatus !== "not_applicable")
  ) return null;
  return {
    id: ids[0],
    intent: intent as SeoQueryIntent,
    recommendedFormat: recommendedFormat as SeoQueryFormat | null,
    audioFit: audioFit as SeoQueryAudioFit,
    analysisStatus,
  };
}
