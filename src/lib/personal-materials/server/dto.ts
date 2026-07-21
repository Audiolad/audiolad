import type {
  PersonalMaterialRow,
  PersonalMaterialStatus,
  PersonalMaterialType,
} from "@/lib/personal-materials/types";

export type SafeAuthorPersonalMaterialDto = {
  id: string;
  authorId: string;
  materialType: PersonalMaterialType;
  title: string | null;
  clientFirstName: string;
  clientLastName: string | null;
  materialDate: string;
  description: string | null;
  personalRecommendation: string | null;
  returnUrl: string | null;
  returnButtonLabel: string | null;
  status: PersonalMaterialStatus;
  guestAccessEnabled: boolean;
  claimed: boolean;
  hasAudio: boolean;
  hasPdf: boolean;
  durationSeconds: number | null;
  audioOriginalFilename: string | null;
  audioSizeBytes: number | null;
  pdfOriginalFilename: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorNotes?: string | null;
};

export type SafeGuestPersonalMaterialDto = {
  id: string;
  materialType: PersonalMaterialType;
  title: string | null;
  clientFirstName: string;
  clientLastName: string | null;
  materialDate: string;
  description: string | null;
  personalRecommendation: string | null;
  returnUrl: string | null;
  returnButtonLabel: string | null;
  author: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
  };
  hasAudio: true;
  hasPdf: boolean;
};

export function toSafeAuthorPersonalMaterialDto(
  row: PersonalMaterialRow,
  authorNotes?: string | null,
): SafeAuthorPersonalMaterialDto {
  const dto: SafeAuthorPersonalMaterialDto = {
    id: row.id,
    authorId: row.author_id,
    materialType: row.material_type,
    title: row.title,
    clientFirstName: row.client_first_name,
    clientLastName: row.client_last_name,
    materialDate: row.material_date,
    description: row.description,
    personalRecommendation: row.personal_recommendation,
    returnUrl: row.return_url,
    returnButtonLabel: row.return_button_label,
    status: row.status,
    guestAccessEnabled: row.guest_access_enabled,
    claimed: row.claimed_by_user_id !== null,
    hasAudio: row.audio_path !== null,
    hasPdf: row.pdf_path !== null,
    durationSeconds: row.duration_seconds,
    audioOriginalFilename: row.audio_original_filename,
    audioSizeBytes: row.audio_size_bytes,
    pdfOriginalFilename: row.pdf_original_filename,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (authorNotes !== undefined) {
    dto.authorNotes = authorNotes;
  }

  return dto;
}

export function toSafeGuestPersonalMaterialDto(input: {
  material: PersonalMaterialRow;
  author: {
    id: string;
    name: string;
    slug: string;
    avatar_url: string | null;
  };
}): SafeGuestPersonalMaterialDto {
  return {
    id: input.material.id,
    materialType: input.material.material_type,
    title: input.material.title,
    clientFirstName: input.material.client_first_name,
    clientLastName: input.material.client_last_name,
    materialDate: input.material.material_date,
    description: input.material.description,
    personalRecommendation: input.material.personal_recommendation,
    returnUrl: input.material.return_url,
    returnButtonLabel: input.material.return_button_label,
    author: {
      id: input.author.id,
      name: input.author.name,
      slug: input.author.slug,
      avatarUrl: input.author.avatar_url,
    },
    hasAudio: true,
    hasPdf: input.material.pdf_path !== null,
  };
}
