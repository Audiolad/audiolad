/** Private Music Analyzer Lab. Not the catalog and not Music Passport. */

export const MUSIC_LAB_BUCKET = "music-analyzer-lab" as const;

export const MUSIC_LAB_EXPERIMENT_CODE = "listening-v05" as const;

export const MUSIC_LAB_ROUTE = "/music-analyzer" as const;

export const MUSIC_LAB_SIGNED_URL_TTL_SECONDS = 900;

export const MUSIC_LAB_EXPERIMENT_TYPES = [
  "human_listening_validation",
  "attention_score",
  "conversation_friendliness",
  "spatial_density",
  "foreground_background",
  "relaxation_pressure",
  "motion_drive",
  "cognitive_load",
  "transition_profile",
] as const;

export type MusicLabExperimentType = (typeof MUSIC_LAB_EXPERIMENT_TYPES)[number];

export const MUSIC_LAB_FUTURE_EXPERIMENT_TYPES = [
  "attention_score",
  "conversation_friendliness",
  "spatial_density",
  "foreground_background",
  "relaxation_pressure",
  "motion_drive",
  "cognitive_load",
  "transition_profile",
] as const;

export const MUSIC_LAB_TABLES = {
  experiments: "music_lab_experiments",
  items: "music_lab_items",
  tasks: "music_lab_tasks",
  responses: "music_lab_responses",
  blindAssignments: "music_lab_blind_assignments",
} as const;

/** Production tables this lab must never write. Used by tests and reviews. */
export const MUSIC_LAB_FORBIDDEN_PRODUCTION_TABLES = [
  "practices",
  "audio_items",
  "music_audio_assets",
  "seo_queries",
  "seo_pages",
  "products",
  "recommendations",
  "business_organizations",
  "business_players",
] as const;
