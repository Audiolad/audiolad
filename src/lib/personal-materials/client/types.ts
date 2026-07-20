import type { PersonalMaterialType } from "@/lib/personal-materials/types";

export type AuthorPersonalMaterial = {
  id: string;
  authorId: string;
  materialType: PersonalMaterialType;
  title: string | null;
  clientFirstName: string;
  clientLastName: string;
  materialDate: string;
  description: string | null;
  personalRecommendation: string | null;
  returnUrl: string | null;
  returnButtonLabel: string | null;
  status: "draft" | "active" | "revoked" | "deleted";
  guestAccessEnabled: boolean;
  claimed: boolean;
  hasAudio: boolean;
  hasPdf: boolean;
  durationSeconds: number | null;
  audioOriginalFilename: string | null;
  audioSizeBytes: number | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAuthorPersonalMaterialInput = {
  authorId: string;
  materialType: PersonalMaterialType;
  title?: string | null;
  clientFirstName: string;
  clientLastName: string;
  materialDate: string;
  description?: string | null;
  personalRecommendation?: string | null;
  returnUrl?: string | null;
  returnButtonLabel?: string | null;
};

export type UpdateAuthorPersonalMaterialInput = {
  materialType?: PersonalMaterialType;
  title?: string | null;
  clientFirstName?: string;
  clientLastName?: string;
  materialDate?: string;
  description?: string | null;
  personalRecommendation?: string | null;
  returnUrl?: string | null;
  returnButtonLabel?: string | null;
};

export type ActivateAuthorPersonalMaterialResponse = {
  material: AuthorPersonalMaterial;
  accessUrl: string;
};

export type RotateAuthorPersonalMaterialResponse = ActivateAuthorPersonalMaterialResponse;

export type PersonalMaterialUiStatus =
  | "draft"
  | "active"
  | "claimed"
  | "revoked"
  | "deleted";
