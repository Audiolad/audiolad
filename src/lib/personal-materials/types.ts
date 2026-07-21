export const PERSONAL_MATERIAL_TYPES = [
  "diagnostic",
  "audio_review",
  "personal_meditation",
  "recommendation",
  "consultation_material",
  "homework",
  "personal_music",
  "other",
] as const;

export type PersonalMaterialType = (typeof PERSONAL_MATERIAL_TYPES)[number];

export const PERSONAL_MATERIAL_STATUSES = [
  "draft",
  "active",
  "revoked",
  "deleted",
] as const;

export type PersonalMaterialStatus = (typeof PERSONAL_MATERIAL_STATUSES)[number];

export type PersonalMaterialRow = {
  id: string;
  author_id: string;
  created_by: string;
  material_type: PersonalMaterialType;
  title: string | null;
  client_first_name: string;
  client_last_name: string;
  material_date: string;
  description: string | null;
  personal_recommendation: string | null;
  return_url: string | null;
  return_button_label: string | null;
  audio_path: string | null;
  audio_original_filename: string | null;
  audio_mime_type: string | null;
  audio_size_bytes: number | null;
  duration_seconds: number | null;
  pdf_path: string | null;
  pdf_original_filename: string | null;
  pdf_mime_type: string | null;
  pdf_size_bytes: number | null;
  status: PersonalMaterialStatus;
  access_token_hash: string | null;
  guest_access_enabled: boolean;
  token_created_at: string | null;
  expires_at: string | null;
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  first_opened_at: string | null;
  first_audio_started_at: string | null;
  revoked_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonalMaterialAuthorNotesRow = {
  personal_material_id: string;
  author_notes: string | null;
  updated_by: string;
  updated_at: string;
};

export type PersonalMaterialOwnerView = {
  id: string;
  author_id: string;
  author_name: string;
  author_slug: string;
  material_type: PersonalMaterialType;
  title: string | null;
  client_first_name: string;
  client_last_name: string;
  material_date: string;
  description: string | null;
  personal_recommendation: string | null;
  has_audio: boolean;
  has_pdf: boolean;
  duration_seconds: number | null;
  audio_original_filename: string | null;
  pdf_original_filename: string | null;
  status: PersonalMaterialStatus;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonalMaterialProgressRow = {
  user_id: string;
  personal_material_id: string;
  position_seconds: number;
  completed: boolean;
  updated_at: string;
};

export type PersonalMaterialGuestAccessState =
  | "available"
  | "revoked"
  | "deleted"
  | "expired"
  | "claimed"
  | "invalid";

export type PersonalMaterialAuthorAccessState =
  | "author"
  | "forbidden"
  | "not_found";

export type PersonalMaterialOwnerAccessState = "owner" | "forbidden" | "not_found";

export const PERSONAL_MATERIAL_LIMITS = {
  titleMaxLength: 120,
  clientNameMaxLength: 80,
  descriptionMaxLength: 2000,
  recommendationMaxLength: 2000,
  authorNotesMaxLength: 4000,
  returnUrlMaxLength: 2000,
  returnButtonLabelMaxLength: 120,
  maxAudioBytes: 50 * 1024 * 1024,
  maxPdfBytes: 20 * 1024 * 1024,
  signedUrlTtlSeconds: 900,
} as const;

export const PERSONAL_MATERIAL_CLAIM_COOKIE = "audiolad_pm_claim" as const;

export const PERSONAL_MATERIAL_CLAIM_PURPOSE = "personal-material-claim" as const;

/** Guest progress localStorage key prefix; suffix is token hash hex, never raw token. */
export const PERSONAL_MATERIAL_GUEST_PROGRESS_KEY_PREFIX =
  "audiolad_pm_gp:" as const;

export const PERSONAL_MATERIAL_DISPLAY_DEFAULTS = {
  diagnosticTitle: "Персональная диагностика",
} as const;
