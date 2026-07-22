export type SenderIdentityKey =
  | "auth_security"
  | "support"
  | "authors"
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
    from: "support@audiolad.ru",
    displayName: "Поддержка АудиоЛад",
  },
  authors: {
    from: "authors@audiolad.ru",
    replyTo: "authors@audiolad.ru",
    displayName: "АудиоЛад для авторов",
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
