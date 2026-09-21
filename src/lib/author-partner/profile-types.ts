export type AuthorPartnerAliasView = {
  code: string;
  codeNormalized: string;
  createdAt: string | null;
};

export type AuthorPartnerProfileView =
  | {
      exists: false;
      authorId: string;
    }
  | {
      exists: true;
      authorId: string;
      primaryCode: string;
      status: string;
      aliases: AuthorPartnerAliasView[];
    };

export function parseAuthorPartnerProfilePayload(
  data: unknown,
  fallbackAuthorId: string,
): AuthorPartnerProfileView {
  if (!data || typeof data !== "object") {
    return { exists: false, authorId: fallbackAuthorId };
  }
  const row = data as Record<string, unknown>;
  if (row.exists === false) {
    return {
      exists: false,
      authorId:
        typeof row.author_id === "string" ? row.author_id : fallbackAuthorId,
    };
  }
  if (row.exists !== true) {
    return { exists: false, authorId: fallbackAuthorId };
  }
  const primaryCode =
    typeof row.primary_code === "string" ? row.primary_code : "";
  if (!primaryCode) {
    return { exists: false, authorId: fallbackAuthorId };
  }
  const aliasesRaw = Array.isArray(row.aliases) ? row.aliases : [];
  const aliases: AuthorPartnerAliasView[] = [];
  for (const item of aliasesRaw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (typeof a.code !== "string") continue;
    aliases.push({
      code: a.code,
      codeNormalized:
        typeof a.code_normalized === "string" ? a.code_normalized : "",
      createdAt: typeof a.created_at === "string" ? a.created_at : null,
    });
  }

  return {
    exists: true,
    authorId:
      typeof row.author_id === "string" ? row.author_id : fallbackAuthorId,
    primaryCode,
    status: typeof row.status === "string" ? row.status : "active",
    aliases,
  };
}
