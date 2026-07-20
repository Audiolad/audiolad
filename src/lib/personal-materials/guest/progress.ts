export const PERSONAL_MATERIAL_GUEST_PROGRESS_STORAGE_PREFIX =
  "audiolad:personal-material-progress:" as const;

export type PersonalMaterialGuestProgress = {
  positionSeconds: number;
  durationSeconds?: number;
  updatedAt: string;
};

export function buildPersonalMaterialProgressStorageKey(materialId: string): string {
  return `${PERSONAL_MATERIAL_GUEST_PROGRESS_STORAGE_PREFIX}${materialId}`;
}

export function parsePersonalMaterialGuestProgress(
  value: string | null,
): PersonalMaterialGuestProgress | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as PersonalMaterialGuestProgress;

    if (
      typeof parsed.positionSeconds !== "number" ||
      !Number.isFinite(parsed.positionSeconds) ||
      parsed.positionSeconds < 0
    ) {
      return null;
    }

    if (
      parsed.durationSeconds !== undefined &&
      (typeof parsed.durationSeconds !== "number" ||
        !Number.isFinite(parsed.durationSeconds) ||
        parsed.durationSeconds < 0)
    ) {
      return null;
    }

    if (typeof parsed.updatedAt !== "string") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function readPersonalMaterialGuestProgress(
  materialId: string,
): PersonalMaterialGuestProgress | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parsePersonalMaterialGuestProgress(
      window.localStorage.getItem(buildPersonalMaterialProgressStorageKey(materialId)),
    );
  } catch {
    return null;
  }
}

export function writePersonalMaterialGuestProgress(
  materialId: string,
  progress: PersonalMaterialGuestProgress,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      buildPersonalMaterialProgressStorageKey(materialId),
      JSON.stringify(progress),
    );
  } catch {
    // Ignore quota or privacy mode errors.
  }
}

export function clearPersonalMaterialGuestProgress(materialId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(buildPersonalMaterialProgressStorageKey(materialId));
  } catch {
    // Ignore storage errors.
  }
}
