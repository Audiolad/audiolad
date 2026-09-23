export const PARTNER_INVITEES_EMPTY =
  "По вашей ссылке пока нет зафиксированных приглашений.";

export const PARTNER_INVITEES_LOAD_ERROR =
  "Не удалось загрузить список приглашённых. Обновите страницу.";

export const PARTNER_PENDING_STATUS = "Ещё не стал автором";

export const PARTNER_REWARD_DOES_NOT_REDUCE_ROYALTY =
  "Партнёрское вознаграждение выплачивает АудиоЛад из своей доли и не уменьшает роялти приглашённого автора.";

const FORBIDDEN_PAYLOAD_KEYS = [
  "email",
  "invitee_email",
  "recipient_email",
  "invitee_user_id",
  "referrer_owner_user_id",
  "user_id",
  "code_used",
  "code_normalized",
  "token_hash",
] as const;

export type PartnerInviteePending = {
  state: "pending";
  registeredAt: string;
};

export type PartnerInviteeActivated = {
  state: "activated";
  displayName: string;
  activatedAt: string;
  expiresAt: string;
};

export type PartnerInviteeView = PartnerInviteePending | PartnerInviteeActivated;

export type PartnerInviteeCard = {
  title: string;
  lines: string[];
  badge: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return value;
}

/** Public workspace title. An address-shaped name is not shown. */
export function safePublicAuthorName(value: unknown): string {
  if (typeof value !== "string") return "Автор";
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("@")) return "Автор";
  return trimmed;
}

export function formatPartnerCabinetDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  });
}

export function partnerRewardUntilCopy(expiresAt: string): string {
  return `Вы получаете 20% от его начисленного роялти до ${formatPartnerCabinetDate(expiresAt)}.`;
}

function payloadHasForbiddenKey(row: Record<string, unknown>): boolean {
  return Object.keys(row).some((key) =>
    FORBIDDEN_PAYLOAD_KEYS.includes(
      key as (typeof FORBIDDEN_PAYLOAD_KEYS)[number],
    ),
  );
}

function parseInviteeItem(value: unknown): PartnerInviteeView | null {
  if (!isRecord(value)) return null;
  if (payloadHasForbiddenKey(value)) return null;

  if (value.state === "pending") {
    const registeredAt = asTimestamp(value.registered_at);
    if (!registeredAt) return null;
    // Pending must not surface a 3-year end, even if a caller attached one.
    return { state: "pending", registeredAt };
  }

  if (value.state === "activated") {
    const activatedAt = asTimestamp(value.activated_at);
    const expiresAt = asTimestamp(value.expires_at);
    if (!activatedAt || !expiresAt) return null;
    return {
      state: "activated",
      displayName: safePublicAuthorName(value.display_name),
      activatedAt,
      expiresAt,
    };
  }

  return null;
}

export function inviteeSortInstant(item: PartnerInviteeView): number {
  const raw = item.state === "pending" ? item.registeredAt : item.activatedAt;
  return new Date(raw).getTime();
}

/** Newest recorded invite or activation first. Dates stay the canonical strings. */
export function sortPartnerInvitees(
  items: readonly PartnerInviteeView[],
): PartnerInviteeView[] {
  return [...items].sort(
    (left, right) => inviteeSortInstant(right) - inviteeSortInstant(left),
  );
}

export function parseAuthorPartnerInviteesPayload(
  data: unknown,
): PartnerInviteeView[] {
  if (!isRecord(data) || data.ok !== true || !Array.isArray(data.invitees)) {
    return [];
  }

  const items: PartnerInviteeView[] = [];
  for (const item of data.invitees) {
    const parsed = parseInviteeItem(item);
    if (parsed) items.push(parsed);
  }
  return sortPartnerInvitees(items);
}

export function describePartnerInvitee(
  item: PartnerInviteeView,
): PartnerInviteeCard {
  if (item.state === "pending") {
    return {
      title: "Приглашение зафиксировано",
      lines: [
        `Приглашение зафиксировано: ${formatPartnerCabinetDate(item.registeredAt)}`,
      ],
      badge: PARTNER_PENDING_STATUS,
    };
  }

  return {
    title: item.displayName,
    lines: [
      `Стал автором: ${formatPartnerCabinetDate(item.activatedAt)}`,
      partnerRewardUntilCopy(item.expiresAt),
      PARTNER_REWARD_DOES_NOT_REDUCE_ROYALTY,
    ],
    badge: null,
  };
}
