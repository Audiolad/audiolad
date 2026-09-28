const RAW_SYSTEM_CODES = ["clap_native", "openl3"];

const ALWAYS_FORBIDDEN = [
  "similarity_ear_key",
  "test_tracks/",
  "passport_embeddings",
  "cosine",
  "embedding",
];

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export function assertMusicLabClientSafe(
  value: unknown,
  extraLiterals: readonly string[] = [],
): void {
  const serialized = JSON.stringify(value) ?? "";

  for (const token of RAW_SYSTEM_CODES) {
    if (serialized.includes(token)) {
      throw new Error("music_lab_client_leak");
    }
  }

  const lowered = serialized.toLowerCase();
  for (const token of ALWAYS_FORBIDDEN) {
    if (lowered.includes(token)) {
      throw new Error("music_lab_client_leak");
    }
  }

  for (const literal of extraLiterals) {
    const trimmed = literal.trim();
    if (trimmed.length < 8) {
      continue;
    }
    if (serialized.includes(trimmed)) {
      throw new Error("music_lab_client_leak");
    }
  }

  if (UUID_PATTERN.test(serialized)) {
    throw new Error("music_lab_client_leak");
  }
}
