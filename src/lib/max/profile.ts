import type { ProfileApplicationVariant } from "@/lib/author-applications/types";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import type {
  ProfileAuthorSection,
  ProfileCounterKey,
  ProfilePageData,
} from "@/lib/profile/types";

const AUTHOR_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COUNTER_KEYS = ["library", "playlists", "completed"] as const;
const APPLICATION_VARIANTS = new Set<ProfileApplicationVariant>([
  "none",
  "draft",
  "submitted",
  "in_review",
  "needs_changes",
  "approved_pending_access",
  "rejected",
]);

export type MaxProfileCounter = {
  key: ProfileCounterKey;
  value: number | null;
  label: string;
};

export type MaxProfileWorkspace = {
  name: string;
  slug: string;
  role: "owner" | "editor";
};

export type MaxProfileAuthorSection =
  | { kind: "member"; workspaces: MaxProfileWorkspace[] }
  | {
      kind: "application";
      variant: ProfileApplicationVariant;
      reviewComment?: string;
    };

export type MaxProfileCard = {
  displayName: string;
  initial: string;
  email: string;
  avatarUrl: string | null;
  rolePrimaryLabel: string;
  authorWorkspaceCountLabel: string | null;
};

export type MaxProfileDto = {
  card: MaxProfileCard;
  counters: MaxProfileCounter[];
  authorSection: MaxProfileAuthorSection;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

export function readMaxHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function readAuthorSlug(value: unknown): string | null {
  const slug = readText(value, 80);
  if (!slug || !AUTHOR_SLUG_RE.test(slug)) return null;
  return slug;
}

function readWorkspace(value: unknown): MaxProfileWorkspace | null {
  if (!isRecord(value)) return null;
  const name = readText(value.name, 200);
  const slug = readAuthorSlug(value.slug);
  if (!name || !slug) return null;
  if (value.role !== "owner" && value.role !== "editor") return null;
  return { name, slug, role: value.role };
}

function readCounter(
  value: unknown,
  key: ProfileCounterKey,
): MaxProfileCounter | null {
  if (!isRecord(value) || value.key !== key) return null;
  if (typeof value.label !== "string" || value.label.trim() === "" || value.label.length > 80) {
    return null;
  }
  if (value.value === null) {
    return { key, value: null, label: value.label };
  }
  if (typeof value.value !== "number" || !Number.isFinite(value.value)) return null;
  return { key, value: value.value, label: value.label };
}

function readCard(value: unknown): MaxProfileCard | null {
  if (!isRecord(value)) return null;
  const displayName = readText(value.displayName, 200);
  const initial = readText(value.initial, 4);
  const rolePrimaryLabel = readText(value.rolePrimaryLabel, 80);
  if (!displayName || !initial || !rolePrimaryLabel) return null;
  const email = typeof value.email === "string" ? value.email.trim().slice(0, 320) : "";
  const authorWorkspaceCountLabel =
    value.authorWorkspaceCountLabel === null
      ? null
      : readText(value.authorWorkspaceCountLabel, 80);
  if (value.authorWorkspaceCountLabel !== null && !authorWorkspaceCountLabel) {
    return null;
  }
  return {
    displayName,
    initial,
    email,
    avatarUrl: readMaxHttpsUrl(value.avatarUrl),
    rolePrimaryLabel,
    authorWorkspaceCountLabel,
  };
}

function readAuthorSection(value: unknown): MaxProfileAuthorSection | null {
  if (!isRecord(value)) return null;
  if (value.kind === "member") {
    if (!Array.isArray(value.workspaces) || value.workspaces.length === 0) return null;
    const workspaces: MaxProfileWorkspace[] = [];
    for (const workspace of value.workspaces) {
      const safe = readWorkspace(workspace);
      if (!safe) return null;
      workspaces.push(safe);
    }
    return { kind: "member", workspaces };
  }
  if (value.kind !== "application") return null;
  if (
    typeof value.variant !== "string" ||
    !APPLICATION_VARIANTS.has(value.variant as ProfileApplicationVariant)
  ) {
    return null;
  }
  const variant = value.variant as ProfileApplicationVariant;
  const reviewComment = readText(value.reviewComment, 2000);
  const showComment =
    (variant === "needs_changes" || variant === "rejected") && Boolean(reviewComment);
  if (showComment && reviewComment) {
    return { kind: "application", variant, reviewComment };
  }
  return { kind: "application", variant };
}

export function readMaxProfilePayload(payload: unknown): MaxProfileDto | null {
  if (!isRecord(payload) || payload.ok !== true) return null;
  return readMaxProfileDto(payload.profile);
}

export function readMaxProfileDto(value: unknown): MaxProfileDto | null {
  if (!isRecord(value)) return null;
  const card = readCard(value.card);
  if (!card || !Array.isArray(value.counters) || value.counters.length !== COUNTER_KEYS.length) {
    return null;
  }
  const counters: MaxProfileCounter[] = [];
  for (let index = 0; index < COUNTER_KEYS.length; index += 1) {
    const counter = readCounter(value.counters[index], COUNTER_KEYS[index]!);
    if (!counter) return null;
    counters.push(counter);
  }
  const authorSection = readAuthorSection(value.authorSection);
  if (!authorSection) return null;
  return { card, counters, authorSection };
}

function mapAuthorSection(section: ProfileAuthorSection): MaxProfileAuthorSection {
  if (section.kind === "member") {
    const workspaces = section.workspaces.flatMap((workspace) => {
      const safe = readWorkspace(workspace);
      return safe ? [safe] : [];
    });
    if (workspaces.length > 0) {
      return { kind: "member", workspaces };
    }
    return { kind: "application", variant: "none" };
  }

  const reviewComment = readText(section.reviewComment, 2000);
  const showComment =
    (section.variant === "needs_changes" || section.variant === "rejected") &&
    Boolean(reviewComment);
  if (showComment && reviewComment) {
    return {
      kind: "application",
      variant: section.variant,
      reviewComment,
    };
  }
  return { kind: "application", variant: section.variant };
}

export function toMaxProfileDto(data: ProfilePageData): MaxProfileDto {
  const dto: MaxProfileDto = {
    card: {
      displayName: data.card.displayName,
      initial: data.card.initial,
      email: data.card.email,
      avatarUrl: readMaxHttpsUrl(data.card.avatarUrl),
      rolePrimaryLabel: data.card.rolePrimaryLabel,
      authorWorkspaceCountLabel: data.card.authorWorkspaceCountLabel,
    },
    counters: data.counters.map((counter) => ({
      key: counter.key,
      value: counter.value,
      label: counter.label,
    })),
    authorSection: mapAuthorSection(data.authorSection),
  };
  const safe = readMaxProfileDto(dto);
  if (!safe) {
    throw new Error("max_profile_dto_invalid");
  }
  return safe;
}

export function maxAuthorDashboardUrl(
  workspaces: readonly { slug: string }[],
): string {
  const base = `${PRODUCTION_APP_ORIGIN}/author-dashboard`;
  if (workspaces.length === 1) {
    return `${base}?author=${encodeURIComponent(workspaces[0]!.slug)}`;
  }
  return base;
}

export function maxProfileExternalUrl(path: string): string | null {
  if (path !== "/become-author") return null;
  return `${PRODUCTION_APP_ORIGIN}${path}`;
}
