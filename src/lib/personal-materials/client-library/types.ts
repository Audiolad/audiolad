export type MyPersonalMaterialProgressDto = {
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  updatedAt: string | null;
};

export type MyPersonalMaterialAvailability = "available" | "unavailable";

export type MyPersonalMaterialListItemDto = {
  id: string;
  materialType: string;
  title: string | null;
  author: {
    id: string;
    name: string;
    slug: string | null;
    avatarUrl: string | null;
  };
  diagnosticDate: string | null;
  claimedAt: string;
  progress: MyPersonalMaterialProgressDto;
  availability: MyPersonalMaterialAvailability;
  hasAudio: boolean;
};

export type MyPersonalMaterialDetailDto = MyPersonalMaterialListItemDto & {
  description: string | null;
  recommendation: string | null;
  returnUrl: string | null;
  returnButtonLabel: string | null;
};

export type MyPersonalMaterialProgressInput = {
  positionSeconds: number;
  durationSeconds?: number;
  completed?: boolean;
};

export type MyPersonalMaterialAudioDto = {
  url: string;
  expiresAt: string;
};
