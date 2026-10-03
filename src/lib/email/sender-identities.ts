export type SenderIdentityKey =
  | "auth_security"
  | "support"
  | "authors"
  | "listeners"
  | "news";

export type SenderIdentity = {
  from: string;
  replyTo?: string;
  displayName?: string;
};

const DEFAULT_SENDER_IDENTITIES: Record<SenderIdentityKey, SenderIdentity> = {
  auth_security: {
    // Must match the Timeweb SMTP mailbox used as envelope-from (GoTrue recovery).
    // no-reply@ is not currently allowed as MAIL FROM on Timeweb SMTP.
    from: "inbox@audiolad.ru",
    replyTo: "support@audiolad.ru",
    displayName: "АудиоЛад",
  },
  support: {
    // Canonical support mailbox. Visible From requires this mailbox's own
    // SMTP credentials (AUDIOLAD_SMTP_SUPPORT_USER/PASS). Do not send via
    // another mailbox as a fake Timeweb alias. auth_security stays on
    // inbox@ and is not this identity.
    from: "1@audiolad.ru",
    replyTo: "1@audiolad.ru",
    displayName: "Поддержка АудиоЛад",
  },
  authors: {
    from: "authors@audiolad.ru",
    replyTo: "authors@audiolad.ru",
    displayName: "АудиоЛад для авторов",
  },
  listeners: {
    // Separate from auth_security even though the mailbox address matches
    // inbox@. V1 does not send listener campaigns through this identity.
    from: "inbox@audiolad.ru",
    replyTo: "inbox@audiolad.ru",
    displayName: "АудиоЛад",
  },
  news: {
    from: "info@audiolad.ru",
    displayName: "АудиоЛад",
  },
};

function readEnvOverride(key: SenderIdentityKey, field: "from" | "replyTo") {
  const envKey = `AUDIOLAD_EMAIL_${key.toUpperCase()}_${field === "from" ? "FROM" : "REPLY_TO"}`;
  return process.env[envKey]?.trim() || null;
}

export function getSenderIdentity(key: SenderIdentityKey): SenderIdentity {
  const defaults = DEFAULT_SENDER_IDENTITIES[key];

  return {
    ...defaults,
    from: readEnvOverride(key, "from") ?? defaults.from,
    replyTo: readEnvOverride(key, "replyTo") ?? defaults.replyTo,
  };
}

export function formatSenderAddress(identity: SenderIdentity): string {
  if (identity.displayName) {
    return `${identity.displayName} <${identity.from}>`;
  }

  return identity.from;
}

/** Human-readable From label for admin UI. MIME encoding stays in formatSenderAddress. */
export function formatHumanSenderLabel(identity: SenderIdentity): string {
  if (identity.displayName) {
    return `${identity.displayName} <${identity.from}>`;
  }

  return identity.from;
}
