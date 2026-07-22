import { formatMimeFromAddress } from "@/lib/email/mime";

import { getSenderIdentity } from "./sender-identities";

export type AuthorsEmailTransport = {
  from: string;
  envelopeFrom: string;
  replyTo: string;
};

/** Authors-facing mail: visible From is authors@, SMTP envelope stays on the primary mailbox. */
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
