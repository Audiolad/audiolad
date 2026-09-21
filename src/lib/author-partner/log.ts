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
