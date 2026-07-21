import type {
  MyPersonalMaterialDetailDto,
  MyPersonalMaterialListItemDto,
  MyPersonalMaterialProgressDto,
} from "./types";
import { isProgressCompleted } from "./display";

type RpcProgress = {
  position_seconds?: unknown;
  completed?: unknown;
  updated_at?: unknown;
};

function mapProgress(
  progress: RpcProgress | null | undefined,
  durationSeconds: number | null,
): MyPersonalMaterialProgressDto {
  const positionSeconds =
    typeof progress?.position_seconds === "number" ? progress.position_seconds : 0;
  const completed =
    progress?.completed === true ||
    isProgressCompleted({ positionSeconds, durationSeconds });

  return {
    positionSeconds,
    durationSeconds,
    completed,
    updatedAt: typeof progress?.updated_at === "string" ? progress.updated_at : null,
  };
}

function mapAuthor(row: Record<string, unknown>) {
  return {
    id: typeof row.author_id === "string" ? row.author_id : "",
    name: typeof row.author_name === "string" ? row.author_name : "Автор",
    slug: typeof row.author_slug === "string" ? row.author_slug : null,
    avatarUrl:
      typeof row.author_avatar_url === "string" ? row.author_avatar_url : null,
  };
}

export function toMyPersonalMaterialListItemDto(
  row: Record<string, unknown>,
): MyPersonalMaterialListItemDto {
  const durationSeconds =
    typeof row.duration_seconds === "number" ? row.duration_seconds : null;
  const hasAudio = row.has_audio === true;
  const progress = mapProgress(
    (row.progress as RpcProgress | null | undefined) ?? null,
    durationSeconds,
  );

  return {
    id: String(row.id),
    materialType: typeof row.material_type === "string" ? row.material_type : "other",
    title: typeof row.title === "string" ? row.title : null,
    author: mapAuthor(row),
    diagnosticDate: typeof row.material_date === "string" ? row.material_date : null,
    claimedAt:
      typeof row.claimed_at === "string"
        ? row.claimed_at
        : typeof row.created_at === "string"
          ? row.created_at
          : new Date(0).toISOString(),
    progress,
    availability: hasAudio ? "available" : "unavailable",
    hasAudio,
  };
}

export function toMyPersonalMaterialDetailDto(
  row: Record<string, unknown>,
): MyPersonalMaterialDetailDto {
  const base = toMyPersonalMaterialListItemDto(row);

  return {
    ...base,
    description: typeof row.description === "string" ? row.description : null,
    recommendation:
      typeof row.personal_recommendation === "string"
        ? row.personal_recommendation
        : null,
    returnUrl: typeof row.return_url === "string" ? row.return_url : null,
    returnButtonLabel:
      typeof row.return_button_label === "string" ? row.return_button_label : null,
  };
}

export function mergeGuestAndServerProgress(input: {
  server: MyPersonalMaterialProgressDto;
  guest: { positionSeconds: number; durationSeconds?: number; updatedAt: string } | null;
}): MyPersonalMaterialProgressDto {
  if (!input.guest) {
    return input.server;
  }

  const guestCompleted = isProgressCompleted({
    positionSeconds: input.guest.positionSeconds,
    durationSeconds: input.guest.durationSeconds ?? input.server.durationSeconds,
  });

  const serverUpdated = input.server.updatedAt
    ? Date.parse(input.server.updatedAt)
    : 0;
  const guestUpdated = Date.parse(input.guest.updatedAt);
  const guestIsNewer =
    !Number.isNaN(guestUpdated) &&
    (Number.isNaN(serverUpdated) || guestUpdated >= serverUpdated);

  const positionSeconds = Math.max(
    input.server.positionSeconds,
    input.guest.positionSeconds,
  );

  return {
    positionSeconds,
    durationSeconds:
      input.server.durationSeconds ?? input.guest.durationSeconds ?? null,
    completed: input.server.completed || guestCompleted,
    updatedAt:
      guestIsNewer && input.guest.updatedAt
        ? input.guest.updatedAt
        : input.server.updatedAt,
  };
}
