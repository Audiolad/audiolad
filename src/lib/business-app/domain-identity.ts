export function extractBusinessFirstName(input: {
  fullName?: string | null;
  metadataFirstName?: string | null;
  email?: string | null;
}): string {
  const fromMeta =
    typeof input.metadataFirstName === "string"
      ? input.metadataFirstName.trim()
      : "";
  // An explicitly saved empty name clears the greeting; do not fall back to email.
  if (typeof input.metadataFirstName === "string") return fromMeta;

  const full =
    typeof input.fullName === "string" ? input.fullName.trim() : "";
  if (full) {
    const first = full.split(/\s+/)[0];
    if (first) return first;
  }

  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (email.includes("@")) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }

  return "";
}

/** Surname from auth user_metadata.last_name. No full_name / email fallback – surname is optional. */
export function extractBusinessLastName(input: {
  metadataLastName?: string | null;
}): string {
  return typeof input.metadataLastName === "string" ? input.metadataLastName.trim() : "";
}
