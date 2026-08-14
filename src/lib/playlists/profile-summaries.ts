import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileSummary = {
  userId: string;
  displayName: string;
  email: string | null;
};

function buildDisplayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmed = fullName?.trim();

  if (trimmed) {
    return trimmed;
  }

  const localPart = email?.split("@")[0]?.trim();

  if (localPart) {
    return localPart;
  }

  return "Пользователь";
}

export async function loadProfileSummaries(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, ProfileSummary>> {
  const uniqueIds = Array.from(
    new Set(userIds.filter((id) => typeof id === "string" && id.length > 0)),
  );
  const result = new Map<string, ProfileSummary>();

  if (uniqueIds.length === 0) {
    return result;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", uniqueIds);

  if (error) {
    console.error("editorial_profile_summaries_error", error.message);
    return result;
  }

  for (const row of data ?? []) {
    if (typeof row.id !== "string") {
      continue;
    }

    const email =
      typeof row.email === "string" && row.email.trim()
        ? row.email.trim()
        : null;

    result.set(row.id, {
      userId: row.id,
      displayName: buildDisplayName(row.full_name, email),
      email,
    });
  }

  return result;
}

export async function searchAudioladProfiles(
  supabase: SupabaseClient,
  query: string,
  options?: { limit?: number; excludeUserIds?: string[] },
): Promise<ProfileSummary[]> {
  const search = query.trim();
  const limit = Math.min(Math.max(options?.limit ?? 8, 1), 20);
  const exclude = new Set(options?.excludeUserIds ?? []);

  if (search.length < 2) {
    return [];
  }

  const escaped = search.replace(/[%_,]/g, "");

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
    .order("full_name", { ascending: true, nullsFirst: false })
    .limit(limit + exclude.size);

  if (error) {
    console.error("editorial_profile_search_error", error.message);
    throw new Error("editorial_profile_search_failed");
  }

  const results: ProfileSummary[] = [];

  for (const row of data ?? []) {
    if (typeof row.id !== "string" || exclude.has(row.id)) {
      continue;
    }

    const email =
      typeof row.email === "string" && row.email.trim()
        ? row.email.trim()
        : null;

    results.push({
      userId: row.id,
      displayName: buildDisplayName(row.full_name, email),
      email,
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}
