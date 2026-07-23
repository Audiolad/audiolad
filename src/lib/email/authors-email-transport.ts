import { formatMimeFromAddress } from "@/lib/email/mime";

import { getSenderIdentity } from "./sender-identities";
import type { SmtpConfig } from "./smtp-config";
import { getAuthorsSmtpConfigFromEnv } from "./smtp-config";

export type AuthorsEmailTransport = {
  from: string;
  envelopeFrom: string;
  replyTo: string;
};

/** Authors-facing mail uses the dedicated authors SMTP mailbox for envelope + auth. */
export function resolveAuthorsEmailTransport(
  smtpMailbox: string,
): AuthorsEmailTransport {
  const sender = getSenderIdentity("authors");
  const envelopeFrom = smtpMailbox.trim().toLowerCase();
  const fromAddress = sender.from.trim().toLowerCase();

  return {
    from: formatMimeFromAddress(
      sender.displayName ?? "АудиоЛад для авторов",
      fromAddress,
    ),
    envelopeFrom,
    replyTo: (sender.replyTo ?? fromAddress).trim().toLowerCase(),
  };
}

export type AuthorsEmailDeliveryContext = {
  smtpConfig: SmtpConfig;
  transport: AuthorsEmailTransport;
};

export type ResolveAuthorsEmailDeliveryResult =
  | { ok: true; delivery: AuthorsEmailDeliveryContext }
  | { ok: false; code: "authors_smtp_not_configured" };

export function resolveAuthorsEmailDeliveryFromEnv(): ResolveAuthorsEmailDeliveryResult {
  const smtpConfig = getAuthorsSmtpConfigFromEnv();

  if (!smtpConfig) {
    return { ok: false, code: "authors_smtp_not_configured" };
  }

  const transport = resolveAuthorsEmailTransport(smtpConfig.user);

  return {
    ok: true,
    delivery: {
      smtpConfig,
      transport,
    },
  };
}
