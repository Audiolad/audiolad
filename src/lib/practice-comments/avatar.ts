const AVATAR_COLORS = ["#7042c5", "#5b4b8a", "#8a5a9a", "#3f6f8a", "#6a4a3a", "#2f6b5a"] as const;

export const LISTENER_COMMENT_AVATAR_PREFIX = "/api/listener-comment-avatars/";

const COMMENT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function listenerAvatarLetter(name: string): string {
  const char = Array.from(name.trim())[0];
  return char ? char.toLocaleUpperCase("ru-RU") : "С";
}

export function listenerAvatarColor(name: string): string {
  const value = name.trim().toLocaleLowerCase("ru-RU");
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

export function listenerAvatarLabel(name: string): string {
  const trimmed = name.trim();
  return trimmed ? `Аватар: ${trimmed}` : "Аватар";
}

function surnameOf(fullName: string | null | undefined): string | null {
  const match = fullName?.trim().match(/^\S+\s+(\S+)/);
  const surname = match?.[1]?.trim() ?? "";
  return surname.length >= 2 ? surname : null;
}

export function sanitizePublicAvatarUrl(
  value: string | null | undefined,
  forbidden?: { userId?: string | null; fullName?: string | null },
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000 || trimmed !== value.trim()) return null;

  const proxyId = trimmed.slice(LISTENER_COMMENT_AVATAR_PREFIX.length);
  if (
    trimmed.startsWith(LISTENER_COMMENT_AVATAR_PREFIX) &&
    COMMENT_ID_RE.test(proxyId) &&
    !trimmed.includes("?") &&
    !trimmed.includes("@")
  ) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const href = url.toString();
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    return null;
  }
  const lower = decoded.toLocaleLowerCase("ru-RU");
  if (lower.includes("@") || lower.includes("token=") || lower.includes("/user-avatars/")) {
    return null;
  }
  if (decoded.includes("..")) return null;
  const userId = forbidden?.userId?.trim().toLocaleLowerCase("ru-RU");
  if (userId && lower.includes(userId)) return null;
  const surname = surnameOf(forbidden?.fullName)?.toLocaleLowerCase("ru-RU");
  if (surname && lower.includes(surname)) return null;
  return href;
}

export function resolveListenerAvatarUrl(input: {
  commentId: string;
  kind: "impression" | "author_reply";
  userId: string;
  profileUrl?: string | null;
  profilePath?: string | null;
  profileFullName?: string | null;
  authorUrl?: string | null;
  authorName?: string | null;
}): string | null {
  if (input.kind === "author_reply") {
    return sanitizePublicAvatarUrl(input.authorUrl, {
      userId: input.userId,
      fullName: input.authorName,
    });
  }
  const safe = sanitizePublicAvatarUrl(input.profileUrl, {
    userId: input.userId,
    fullName: input.profileFullName,
  });
  if (safe) return safe;
  if (input.profilePath?.trim() && COMMENT_ID_RE.test(input.commentId)) {
    return `${LISTENER_COMMENT_AVATAR_PREFIX}${input.commentId}`;
  }
  return null;
}

export function listenerAvatarPresentation(input: {
  name: string;
  url: string | null;
  imageFailed: boolean;
}):
  | { kind: "image"; url: string; alt: string }
  | { kind: "letter"; letter: string; color: string; label: string } {
  const safe = sanitizePublicAvatarUrl(input.url);
  if (safe && !input.imageFailed) {
    return { kind: "image", url: safe, alt: listenerAvatarLabel(input.name) };
  }
  return {
    kind: "letter",
    letter: listenerAvatarLetter(input.name),
    color: listenerAvatarColor(input.name),
    label: listenerAvatarLabel(input.name),
  };
}
