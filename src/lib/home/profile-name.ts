type UserMetadata = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
};

type ProfileRow = {
  full_name: string | null;
};

function extractFirstName(fullName: string): string | null {
  const trimmed = fullName.trim();

  if (!trimmed) {
    return null;
  }

  const firstWord = trimmed.split(/\s+/)[0]?.trim();

  return firstWord || null;
}

export function getGreetingFirstName(
  profile: ProfileRow | null,
  userMetadata: UserMetadata | undefined,
): string | null {
  const meta = userMetadata ?? {};

  const metaFirstName =
    typeof meta.first_name === "string" ? meta.first_name.trim() : "";

  if (metaFirstName) {
    return metaFirstName;
  }

  const profileFullName = profile?.full_name?.trim();

  if (profileFullName) {
    return extractFirstName(profileFullName);
  }

  const metaFullName =
    typeof meta.full_name === "string" ? meta.full_name.trim() : "";

  if (metaFullName) {
    return extractFirstName(metaFullName);
  }

  const firstName =
    typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const lastName =
    typeof meta.last_name === "string" ? meta.last_name.trim() : "";
  const combined = `${firstName} ${lastName}`.trim();

  if (combined) {
    return extractFirstName(combined);
  }

  return null;
}
