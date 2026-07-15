import type {
  PersonalMaterialGuestAccessState,
  PersonalMaterialRow,
  PersonalMaterialStatus,
} from "./types";

export function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function shouldRenderOptionalBlock(
  value: string | null | undefined,
): value is string {
  return normalizeOptionalText(value) !== null;
}

export function isPersonalMaterialDeleted(
  material: Pick<PersonalMaterialRow, "status" | "deleted_at">,
): boolean {
  return material.status === "deleted" || material.deleted_at !== null;
}

export function isPersonalMaterialRevoked(
  material: Pick<PersonalMaterialRow, "status" | "revoked_at">,
): boolean {
  return material.status === "revoked" || material.revoked_at !== null;
}

export function isPersonalMaterialExpired(
  material: Pick<PersonalMaterialRow, "expires_at">,
  now: Date = new Date(),
): boolean {
  if (!material.expires_at) {
    return false;
  }

  const expiresAt = new Date(material.expires_at);

  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt <= now;
}

export function resolveGuestAccessState(
  material: Pick<
    PersonalMaterialRow,
    | "status"
    | "guest_access_enabled"
    | "claimed_by_user_id"
    | "expires_at"
    | "deleted_at"
    | "revoked_at"
    | "access_token_hash"
  >,
  now: Date = new Date(),
): PersonalMaterialGuestAccessState {
  if (isPersonalMaterialDeleted(material) || material.status === "deleted") {
    return "deleted";
  }

  if (isPersonalMaterialRevoked(material) || material.status === "revoked") {
    return "revoked";
  }

  if (material.status !== "active") {
    return "invalid";
  }

  if (isPersonalMaterialExpired(material, now)) {
    return "expired";
  }

  if (material.claimed_by_user_id !== null || !material.guest_access_enabled) {
    return "claimed";
  }

  return "available";
}

export function canAuthorManageMaterial(
  material: Pick<PersonalMaterialRow, "author_id">,
  authorIds: ReadonlySet<string>,
): boolean {
  return authorIds.has(material.author_id);
}

export function canOwnerAccessMaterial(
  material: Pick<PersonalMaterialRow, "claimed_by_user_id" | "status">,
  userId: string,
): boolean {
  return (
    material.claimed_by_user_id === userId && material.status !== "deleted"
  );
}

export function isVisibleToOwner(
  status: PersonalMaterialStatus,
): boolean {
  return status !== "deleted";
}

export function getGuestClaimBlockedMessage(): string {
  return "Диагностика уже сохранена в личном кабинете. Войдите, чтобы продолжить прослушивание.";
}

export function getNeutralAccessDeniedMessage(): string {
  return "Материал недоступен.";
}

export function getPersonalMaterialDisplayTitle(
  title: string | null | undefined,
  materialType: string = "diagnostic",
  materialDate?: string | null,
): string {
  const normalized = normalizeOptionalText(title);

  if (normalized) {
    return normalized;
  }

  if (materialType === "diagnostic") {
    return "Персональная диагностика";
  }

  if (materialDate) {
    return `Материал от ${materialDate}`;
  }

  return "Персональный материал";
}

export function buildGuestProgressStorageKey(tokenHashHex: string): string {
  return `audiolad_pm_gp:${tokenHashHex}`;
}
