import {
  PARTNER_CODE_PURPOSES,
  formatPartnerCode,
  isPartnerCodePurpose,
  partnerCodeStatus,
  type PartnerCodePurpose,
  type PartnerCodeStatus,
} from "@/lib/business/partner-codes";

export const BUSINESS_PARTNER_CODES_HREF = "/admin/business-partner-codes";

export type PartnerCodeDbRow = {
  id: string;
  code: string;
  purpose: string;
  recipient_note: string | null;
  unit_price_minor: number;
  discount_periods: number;
  created_at: string;
  reserved_until: string | null;
  bound_organization_id: string | null;
  bound_at: string | null;
  revoked_at: string | null;
};

export type PartnerEntitlementDbRow = { organization_id: string; code_id: string; first_paid_at: string };
export type PartnerPeriodDbRow = { organization_id: string; period_index: number; venue_count: number; period_end: string };

export type PartnerCodeAdminRow = {
  id: string;
  code: string;
  codeDisplay: string;
  purpose: PartnerCodePurpose;
  purposeLabel: string;
  note: string | null;
  unitPriceRub: number;
  discountPeriods: number;
  status: PartnerCodeStatus;
  createdAt: string;
  organizationId: string | null;
  organizationName: string | null;
  firstPaidAt: string | null;
  periodsApplied: number;
  periodsLeft: number;
  /** End of the last paid period at the personal price. */
  discountPaidUntil: string | null;
  canRevoke: boolean;
};

/** One row per code, joined in memory from service-only tables. No personal data beyond the note. */
export function buildPartnerCodeAdminRows(input: {
  codes: PartnerCodeDbRow[];
  entitlements: PartnerEntitlementDbRow[];
  periods: PartnerPeriodDbRow[];
  organizationNames: Record<string, string>;
  /** Codes with an open (pending) payment link at the personal price. */
  openPaymentCodeIds?: ReadonlySet<string>;
  now: Date;
}): PartnerCodeAdminRow[] {
  return input.codes.map((code) => {
    const entitlement = input.entitlements.find((row) => row.code_id === code.id) ?? null;
    const organizationId = entitlement?.organization_id ?? code.bound_organization_id;
    const periods = organizationId ? input.periods.filter((row) => row.organization_id === organizationId) : [];
    const periodsApplied = periods.length;
    const ends = periods.map((row) => row.period_end).sort();
    const purpose = isPartnerCodePurpose(code.purpose) ? code.purpose : "other";
    const status = partnerCodeStatus({
      revokedAt: code.revoked_at,
      boundOrganizationId: code.bound_organization_id,
      reservedUntil: code.reserved_until,
      hasOpenPayment: input.openPaymentCodeIds?.has(code.id) ?? false,
      periodsApplied,
      discountPeriods: code.discount_periods,
      now: input.now,
    });
    return {
      id: code.id,
      code: code.code,
      codeDisplay: formatPartnerCode(code.code),
      purpose,
      purposeLabel: PARTNER_CODE_PURPOSES[purpose],
      note: code.recipient_note,
      unitPriceRub: code.unit_price_minor / 100,
      discountPeriods: code.discount_periods,
      status,
      createdAt: code.created_at,
      organizationId: organizationId ?? null,
      organizationName: organizationId ? input.organizationNames[organizationId] ?? null : null,
      firstPaidAt: entitlement?.first_paid_at ?? code.bound_at,
      periodsApplied,
      periodsLeft: Math.max(code.discount_periods - periodsApplied, 0),
      discountPaidUntil: ends.length ? ends[ends.length - 1] : null,
      canRevoke: !code.bound_organization_id && !code.revoked_at,
    };
  });
}
