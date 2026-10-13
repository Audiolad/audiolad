import { TEST_USER_RESET_NORMALIZED_EMAIL } from "@/lib/admin/test-user-reset/constants";
import { validateEmailFormat } from "@/lib/auth/email/validate-format";
import {
  activeSuppressionScopes,
  evaluateAuthorDelivery,
  type ApplicationSuppressionEntry,
  type AuthorDeliveryPreference,
} from "@/lib/email/delivery-gate";
import { hasFixtureMarker } from "@/lib/fixtures/test-fixture-marker";
import { isAuthorCommercialActiveAccess } from "@/lib/authors/access";

import type { AuthorCampaignFilter } from "./validation";

export const MAILING_RECIPIENT_LIMIT = 5000;
export const MAILING_LISTING_CAP = 1000;

export type AuthorMailingCandidate = {
  authorId: string;
  userId: string | null;
  contactId: string | null;
  email: string | null;
  displayName: string | null;
  fullName: string | null;
  isFixture: boolean;
  hasPublishedProduct: boolean;
  isCommercial: boolean;
};

export type DeliveryGateFacts = {
  suppressions: readonly ApplicationSuppressionEntry[];
  preference: AuthorDeliveryPreference | null;
  latestAuthorMarketingConsent: "granted" | "revoked" | null;
};

export type PlannedRecipientStatus = "queued" | "suppressed" | "excluded";

export type PlannedRecipient = {
  authorId: string;
  userId: string | null;
  contactId: string | null;
  email: string;
  normalizedEmail: string;
  displayName: string | null;
  firstName: string | null;
  status: PlannedRecipientStatus;
  suppressionReason: string | null;
};

export type RecipientPlanSummary = {
  found: number;
  suppressed: number;
  consentExcluded: number;
  invalidOrNoEmail: number;
  /** Repeated addresses (one address receives the message once). Not part of excludedOther. */
  duplicateEmails: number;
  excludedOther: number;
  ready: number;
};

export type RecipientListingReason =
  | "duplicate"
  | "consent"
  | "suppressed"
  | "invalid_email"
  | "fixture";

/** Admin-facing row for the «Показать получателей» list. Never persisted. */
export type RecipientListingEntry = {
  name: string | null;
  email: string | null;
  status: "queued" | "excluded";
  reason: RecipientListingReason | null;
};

export function isMailingFixtureCandidate(input: {
  avatarImage?: unknown;
  email: string | null;
}): boolean {
  if (hasFixtureMarker(input.avatarImage)) {
    return true;
  }

  const email = input.email?.trim().toLowerCase() ?? "";
  return email === TEST_USER_RESET_NORMALIZED_EMAIL;
}

export function isCommercialAuthorStatus(status: string | null | undefined): boolean {
  return isAuthorCommercialActiveAccess(status);
}

export function firstNameFromFullName(fullName: string | null | undefined): string | null {
  const token = fullName?.trim().split(/\s+/)[0] ?? "";

  if (!token || token.includes("@") || token.length < 2) {
    return null;
  }

  return token;
}

function matchesFilter(
  candidate: AuthorMailingCandidate,
  filter: AuthorCampaignFilter,
): boolean {
  switch (filter.kind) {
    case "all_authors":
      return true;
    case "specific_authors":
      return filter.authorIds.includes(candidate.authorId.toLowerCase());
    case "published_products":
      return candidate.hasPublishedProduct;
    case "no_published_products":
      return !candidate.hasPublishedProduct;
    case "commercial_authors":
      return candidate.isCommercial;
    default:
      return false;
  }
}

export function planAuthorRecipients(input: {
  candidates: readonly AuthorMailingCandidate[];
  filter: AuthorCampaignFilter;
  messageType: "author_operational" | "author_marketing";
  gatesByEmail?: ReadonlyMap<string, DeliveryGateFacts>;
  now?: Date;
}):
  | {
      ok: true;
      rows: PlannedRecipient[];
      summary: RecipientPlanSummary;
      listing: RecipientListingEntry[];
    }
  | { ok: false; code: "filter_invalid" | "too_many_recipients" } {
  const now = input.now ?? new Date();
  const matched = input.candidates.filter((candidate) => matchesFilter(candidate, input.filter));

  if (matched.length > MAILING_RECIPIENT_LIMIT) {
    return { ok: false, code: "too_many_recipients" };
  }

  const summary: RecipientPlanSummary = {
    found: matched.length,
    suppressed: 0,
    consentExcluded: 0,
    invalidOrNoEmail: 0,
    duplicateEmails: 0,
    excludedOther: 0,
    ready: 0,
  };
  const rows: PlannedRecipient[] = [];
  const listing: RecipientListingEntry[] = [];
  const seenEmails = new Set<string>();

  for (const candidate of matched) {
    const displayName = candidate.displayName?.trim() || null;
    const firstName = firstNameFromFullName(candidate.fullName);
    const listName = candidate.fullName?.trim() || displayName;
    const list = (
      email: string | null,
      status: "queued" | "excluded",
      reason: RecipientListingReason | null,
    ) => listing.push({ name: listName, email, status, reason });

    if (candidate.isFixture) {
      summary.excludedOther += 1;
      list(candidate.email?.trim() || null, "excluded", "fixture");
      if (candidate.email?.trim()) {
        const parsed = validateEmailFormat(candidate.email);
        rows.push({
          authorId: candidate.authorId,
          userId: candidate.userId,
          contactId: candidate.contactId,
          email: parsed.ok ? parsed.normalizedEmail : candidate.email.trim(),
          normalizedEmail: parsed.ok ? parsed.normalizedEmail : candidate.email.trim().toLowerCase(),
          displayName,
          firstName,
          status: "excluded",
          suppressionReason: "fixture",
        });
      }
      continue;
    }

    const parsed = candidate.email ? validateEmailFormat(candidate.email) : null;
    if (!parsed || !parsed.ok) {
      summary.invalidOrNoEmail += 1;
      list(candidate.email?.trim() || null, "excluded", "invalid_email");
      continue;
    }

    if (seenEmails.has(parsed.normalizedEmail)) {
      summary.duplicateEmails += 1;
      list(parsed.normalizedEmail, "excluded", "duplicate");
      rows.push({
        authorId: candidate.authorId,
        userId: candidate.userId,
        contactId: candidate.contactId,
        email: parsed.normalizedEmail,
        normalizedEmail: parsed.normalizedEmail,
        displayName,
        firstName,
        status: "excluded",
        suppressionReason: "duplicate",
      });
      continue;
    }

    seenEmails.add(parsed.normalizedEmail);
    const gate = input.gatesByEmail?.get(parsed.normalizedEmail);
    const scopes = activeSuppressionScopes({
      normalizedEmail: parsed.normalizedEmail,
      suppressions: gate?.suppressions ?? [],
      now,
    });
    const decision = evaluateAuthorDelivery({
      messageType: input.messageType,
      scopes,
      preference: gate?.preference ?? null,
      latestAuthorMarketingConsent: gate?.latestAuthorMarketingConsent ?? null,
    });

    if (!decision.ok && decision.code === "suppressed") {
      summary.suppressed += 1;
      list(parsed.normalizedEmail, "excluded", "suppressed");
      rows.push({
        authorId: candidate.authorId,
        userId: candidate.userId,
        contactId: candidate.contactId,
        email: parsed.normalizedEmail,
        normalizedEmail: parsed.normalizedEmail,
        displayName,
        firstName,
        status: "suppressed",
        suppressionReason: decision.reason,
      });
      continue;
    }

    if (!decision.ok) {
      summary.consentExcluded += 1;
      list(parsed.normalizedEmail, "excluded", "consent");
      rows.push({
        authorId: candidate.authorId,
        userId: candidate.userId,
        contactId: candidate.contactId,
        email: parsed.normalizedEmail,
        normalizedEmail: parsed.normalizedEmail,
        displayName,
        firstName,
        status: "excluded",
        suppressionReason: decision.reason,
      });
      continue;
    }

    summary.ready += 1;
    list(parsed.normalizedEmail, "queued", null);
    rows.push({
      authorId: candidate.authorId,
      userId: candidate.userId,
      contactId: candidate.contactId,
      email: parsed.normalizedEmail,
      normalizedEmail: parsed.normalizedEmail,
      displayName,
      firstName,
      status: "queued",
      suppressionReason: null,
    });
  }

  return { ok: true, rows, summary, listing };
}
