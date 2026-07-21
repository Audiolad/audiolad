import { getPersonalMaterialTypeLabel } from "@/lib/personal-materials/client/status-labels";
import { normalizeOptionalText } from "@/lib/personal-materials/access";
import type { MyPersonalMaterialAvailability } from "./types";

export type ClientLibraryUiStatus = "available" | "completed" | "unavailable";

export function getMyMaterialDisplayTitle(
  title: string | null | undefined,
  materialType: string,
): string {
  const normalized = normalizeOptionalText(title);
  if (normalized) {
    return normalized;
  }
  return getPersonalMaterialTypeLabel(materialType);
}

export function resolveClientLibraryUiStatus(input: {
  availability: MyPersonalMaterialAvailability;
  completed: boolean;
  hasAudio: boolean;
}): ClientLibraryUiStatus {
  if (input.availability === "unavailable" || !input.hasAudio) {
    return "unavailable";
  }
  if (input.completed) {
    return "completed";
  }
  return "available";
}

export function getClientLibraryStatusLabel(status: ClientLibraryUiStatus): string {
  switch (status) {
    case "completed":
      return "Прослушано";
    case "unavailable":
      return "Недоступен";
    default:
      return "Доступен";
  }
}

export function getClientLibraryStatusClassName(status: ClientLibraryUiStatus): string {
  switch (status) {
    case "completed":
      return "bg-[#eef3ff] text-[#4f6db8]";
    case "unavailable":
      return "bg-[#f2f2f7] text-[#6d6d80]";
    default:
      return "bg-[#eaf7ef] text-[#3d8d65]";
  }
}

export function formatClaimedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function getProgressLabel(input: {
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
}): string {
  if (input.completed) {
    return "Прослушано";
  }

  if (
    !input.durationSeconds ||
    input.durationSeconds <= 0 ||
    input.positionSeconds <= 0
  ) {
    return "Не начато";
  }

  const percent = Math.min(
    99,
    Math.max(1, Math.round((input.positionSeconds / input.durationSeconds) * 100)),
  );
  return `Прослушано ${percent}%`;
}

export function getProgressPercent(input: {
  positionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
}): number | null {
  if (input.completed) {
    return 100;
  }
  if (!input.durationSeconds || input.durationSeconds <= 0) {
    return null;
  }
  if (input.positionSeconds <= 0) {
    return 0;
  }
  return Math.min(
    99,
    Math.max(1, Math.round((input.positionSeconds / input.durationSeconds) * 100)),
  );
}

export function isProgressCompleted(input: {
  positionSeconds: number;
  durationSeconds: number | null | undefined;
  completed?: boolean;
}): boolean {
  if (input.completed) {
    return true;
  }
  const duration = input.durationSeconds;
  if (!duration || duration <= 0) {
    return false;
  }
  const threshold = Math.max(duration - 15, Math.ceil(duration * 0.95));
  return input.positionSeconds >= threshold;
}
