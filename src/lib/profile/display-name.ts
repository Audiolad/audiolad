export type UserMetadata = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
};

export type ProfileNameRow = {
  full_name: string | null;
};

export function getDisplayName(
  profile: ProfileNameRow | null,
  user: { email?: string; user_metadata?: UserMetadata },
): string {
  const meta = user.user_metadata ?? {};
  const profileFullName = profile?.full_name?.trim();

  if (profileFullName) {
    return profileFullName;
  }

  const metaFullName =
    typeof meta.full_name === "string" ? meta.full_name.trim() : "";

  if (metaFullName) {
    return metaFullName;
  }

  const firstName =
    typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const lastName =
    typeof meta.last_name === "string" ? meta.last_name.trim() : "";
  const combined = `${firstName} ${lastName}`.trim();

  if (combined) {
    return combined;
  }

  const emailLocalPart = user.email?.split("@")[0]?.trim();

  if (emailLocalPart) {
    return emailLocalPart;
  }

  return "Пользователь";
}

export function getInitial(displayName: string): string {
  const char = displayName.trim().charAt(0);

  return char ? char.toUpperCase() : "П";
}

export function getProfileRolePrimaryLabel(
  authorWorkspaceCount: number,
): string {
  if (authorWorkspaceCount > 0) {
    return "Слушатель · Автор";
  }

  return "Слушатель";
}

export function getAuthorWorkspaceCountLabel(count: number): string | null {
  if (count <= 1) {
    return null;
  }

  const mod10 = count % 10;
  const mod100 = count % 100;

  let word = "пространств";

  if (mod10 === 1 && mod100 !== 11) {
    word = "пространство";
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = "пространства";
  }

  return `${count} авторских ${word}`;
}
