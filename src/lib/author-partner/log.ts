type PartnerAttributionLogEvent =
  | "partner_attribution_created"
  | "partner_attribution_preserved_first_touch"
  | "partner_attribution_bound_signup"
  | "partner_attribution_bound_signin"
  | "partner_attribution_bound_invite_authenticated"
  | "partner_attribution_bound_manual"
  | "partner_attribution_expired"
  | "partner_attribution_rejected_existing_author"
  | "partner_attribution_rejected_self_referral"
  | "partner_attribution_rejected_not_found"
  | "partner_attribution_claim_failed"
  | "partner_attribution_touch_failed"
  | "partner_referral_activated"
  | "partner_referral_activation_idempotent"
  | "partner_referral_activation_expired"
  | "partner_referral_activation_no_referral"
  | "partner_bonus_slot_granted";

type PartnerAttributionLogFields = {
  event: PartnerAttributionLogEvent;
  result?: string;
  error?: string;
  attributionId?: string;
  referralId?: string;
  referrerAuthorId?: string;
  /** Never log raw cookie token or email. */
  hasToken?: boolean;
};

export function logPartnerAttribution(fields: PartnerAttributionLogFields): void {
  console.info(
    JSON.stringify({
      scope: "author_partner_attribution",
      ...fields,
      at: new Date().toISOString(),
    }),
  );
}

type PartnerYour20RpcLogFields = {
  event: "author_partner_change_code_rpc_failed" | "author_partner_ensure_rpc_failed";
  authorId: string;
  postgresCode?: string | null;
  /** Sanitized / truncated PostgREST message — never JWT, cookie, email. */
  messageToken?: string | null;
  detailsToken?: string | null;
  hintToken?: string | null;
};

function sanitizePartnerLogToken(
  value: string | null | undefined,
  max = 180,
): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/i.test(trimmed)) {
    return "[redacted-jwt-like]";
  }
  if (/@/.test(trimmed) && /\./.test(trimmed)) {
    return trimmed.replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      "[redacted-email]",
    );
  }
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function logPartnerYour20RpcFailure(
  fields: PartnerYour20RpcLogFields,
): void {
  console.error(
    JSON.stringify({
      scope: "author_partner_your_20",
      event: fields.event,
      author_id: fields.authorId,
      postgres_code: fields.postgresCode ?? null,
      message_token: sanitizePartnerLogToken(fields.messageToken),
      details_token: sanitizePartnerLogToken(fields.detailsToken),
      hint_token: sanitizePartnerLogToken(fields.hintToken),
      at: new Date().toISOString(),
    }),
  );
}
