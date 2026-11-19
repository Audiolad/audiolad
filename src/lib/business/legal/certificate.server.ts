import "server-only";

import { resolveCustomerAccess } from "@/lib/access-grants/policy";
import { loadLocationAccess } from "@/lib/business-app/venue-licence/load.server";
import { clockOf, formatVenueAddress, formatVenueName, periodOf } from "@/lib/business-app/venue-licence/present";
import { BUSINESS_OFFER_EDITION } from "@/lib/business/offer";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  businessAccountCode,
  certificateSnapshotHash,
  certificateSnapshotJson,
  parseCertificateSnapshot,
  type CertificateCheckStatus,
  type CertificateMissing,
  type CertificatePeriodKind,
  type CertificateSnapshot,
} from "./certificate";

/**
 * Выдача и проверка сертификата точки (t1591u). Всё – service role, на сервере.
 * Кабинет вызывает ensureVenueCertificate только для точки владельца из его сессии
 * (или точки, к которой привязано устройство зала). Страница проверки – только чтение.
 */

type Db = ReturnType<typeof createServiceRoleClient>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim() : null;
}

export type LegalIdentity = {
  inn: string;
  kind: "ul" | "ip";
  name: string;
  fullName: string;
  ogrn: string;
  checkedAt: string | null;
};

export async function loadOrganizationLegalIdentity(db: Db, organizationId: string): Promise<LegalIdentity | null> {
  const { data, error } = await db
    .from("business_organizations")
    .select("legal_inn, legal_kind, legal_name, legal_full_name, legal_ogrn, legal_checked_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error("certificate_unavailable");
  const inn = str(data?.legal_inn);
  const kind = data?.legal_kind === "ip" || data?.legal_kind === "ul" ? data.legal_kind : null;
  const name = str(data?.legal_name);
  const ogrn = str(data?.legal_ogrn);
  if (!inn || !kind || !name || !ogrn) return null;
  return { inn, kind, name, fullName: str(data?.legal_full_name) ?? name, ogrn, checkedAt: str(data?.legal_checked_at) };
}

type LocationRow = {
  id: string;
  organization_id: string;
  name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
};

const LOCATION_COLUMNS = "id, organization_id, name, address_line1, address_line2, city, region, postal_code";

function venueOf(location: LocationRow): { name: string; address: string | null } {
  const place = {
    locationName: str(location.name) ?? "",
    addressLine1: str(location.address_line1),
    addressLine2: str(location.address_line2),
    city: str(location.city),
    region: str(location.region),
    postalCode: str(location.postal_code),
  };
  // Адрес обязателен: улица из кабинета (address_line1) – без неё сертификата нет.
  return { name: formatVenueName(place), address: place.addressLine1 ? formatVenueAddress(place) : null };
}

type LiveAccess = { active: boolean; kind: CertificatePeriodKind | null; start: string | null; end: string | null; ownerId: string | null };

async function liveAccess(db: Db, location: LocationRow, now: Date): Promise<LiveAccess> {
  const access = await loadLocationAccess(db, { id: location.id, organization_id: location.organization_id });
  const confirmed = Boolean(access.grant || access.paidUntil);
  const resolved = resolveCustomerAccess({ now, emailConfirmed: confirmed, grant: access.grant, paidUntil: access.paidUntil });
  // Пробная неделя (подарочный период) – действующий доступ (решение Сергея 19.11.2026).
  const active = resolved.mode === "trial" || resolved.mode === "paid";
  if (!active) return { active: false, kind: null, start: null, end: null, ownerId: access.ownerId };
  const clock = clockOf(access.grant, access.paidUntil);
  const period = periodOf(clock, access.grant, access.paidUntil, access.paidPeriod);
  return {
    active: Boolean(period.end),
    kind: clock === "gift" ? "gift" : "subscription",
    start: period.start,
    end: period.end,
    ownerId: access.ownerId,
  };
}

async function currentEditionAcceptedAt(db: Db, ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;
  const { data, error } = await db
    .from("business_offer_edition_acceptances")
    .select("accepted_at")
    .eq("user_id", ownerId)
    .eq("document_key", BUSINESS_OFFER_EDITION.documentKey)
    .eq("document_version", BUSINESS_OFFER_EDITION.version)
    .eq("content_hash", BUSINESS_OFFER_EDITION.contentHash)
    .order("accepted_at", { ascending: true })
    .limit(1);
  if (error) throw new Error("certificate_unavailable");
  return str(data?.[0]?.accepted_at);
}

type VenueFacts = { identity: LegalIdentity | null; venueName: string; venueAddressLine: string | null };

export type VenueCertificateState =
  | ({ kind: "missing"; missing: CertificateMissing[] } & VenueFacts)
  | ({ kind: "issued"; number: string; issuedAt: string; snapshot: CertificateSnapshot } & VenueFacts);

/**
 * Выдаёт сертификат точки или возвращает текущий, если данные не менялись.
 * Условия (приложение 2, п. 3): ИНН, адрес точки, действующий доступ (подарочный или оплаченный),
 * принятая действующая редакция договора.
 */
export async function ensureVenueCertificate(locationId: string, now: Date = new Date()): Promise<VenueCertificateState> {
  const db = createServiceRoleClient();
  const { data: location, error } = await db.from("business_locations").select(LOCATION_COLUMNS).eq("id", locationId).maybeSingle();
  if (error) throw new Error("certificate_unavailable");
  if (!location?.id || !location.organization_id) throw new Error("certificate_location_unknown");
  const row = location as LocationRow;
  const venue = venueOf(row);
  const identity = await loadOrganizationLegalIdentity(db, row.organization_id);
  const access = await liveAccess(db, row, now);
  const acceptedAt = await currentEditionAcceptedAt(db, access.ownerId);

  const missing: CertificateMissing[] = [];
  if (!identity) missing.push("inn");
  if (!venue.address) missing.push("address");
  if (!acceptedAt) missing.push("offer");
  if (!access.active || !access.end || !access.kind) missing.push("access");
  if (missing.length || !identity || !venue.address || !acceptedAt || !access.end || !access.kind) {
    return { kind: "missing", missing, identity, venueName: venue.name, venueAddressLine: venue.address };
  }

  const snapshot: CertificateSnapshot = {
    v: 1,
    venueName: venue.name,
    venueAddress: venue.address,
    licensee: { kind: identity.kind, name: identity.name, fullName: identity.fullName, inn: identity.inn, ogrn: identity.ogrn },
    accountCode: businessAccountCode(row.organization_id),
    period: { kind: access.kind, start: access.start, end: access.end },
    offer: { version: BUSINESS_OFFER_EDITION.version, label: BUSINESS_OFFER_EDITION.label, acceptedAt },
  };
  const { data: issued, error: issueError } = await db.rpc("issue_business_venue_certificate", {
    p_location_id: row.id,
    p_organization_id: row.organization_id,
    p_snapshot_hash: certificateSnapshotHash(snapshot),
    p_snapshot: JSON.parse(certificateSnapshotJson(snapshot)),
    p_period_start: access.start,
    p_period_end: access.end,
    p_period_kind: access.kind,
    p_offer_version: BUSINESS_OFFER_EDITION.version,
    p_offer_accepted_at: acceptedAt,
  });
  if (issueError) throw new Error("certificate_unavailable");
  const out = (Array.isArray(issued) ? issued[0] : issued) as { number?: unknown; issued_at?: unknown } | null;
  const number = str(out?.number);
  const issuedAt = str(out?.issued_at);
  if (!number || !issuedAt) throw new Error("certificate_unavailable");
  // When nothing changed the stored snapshot is the same one (same hash), so the fresh object is shown.
  return { kind: "issued", number, issuedAt, snapshot, identity, venueName: venue.name, venueAddressLine: venue.address };
}

export type CertificateCheck = {
  number: string;
  issuedAt: string;
  snapshot: CertificateSnapshot;
  status: CertificateCheckStatus;
  /** Для действующего – конец текущего периода доступа (может быть позже, чем в распечатке). */
  validUntil: string;
  supersededByNumber: string | null;
};

/** Страница проверки: только чтение. Номер уже нормализован (ALK-YYYY-NNNNNN). */
export async function loadCertificateCheck(number: string, now: Date = new Date()): Promise<CertificateCheck | null> {
  const db = createServiceRoleClient();
  const { data: cert, error } = await db
    .from("business_venue_certificates")
    .select("number, location_id, issued_at, snapshot, period_end, superseded_at, superseded_by, revoked_at")
    .eq("number", number)
    .maybeSingle();
  if (error) throw new Error("certificate_unavailable");
  if (!cert) return null;
  const snapshot = parseCertificateSnapshot(cert.snapshot);
  if (!snapshot) throw new Error("certificate_unavailable");

  let status: CertificateCheckStatus;
  let validUntil = snapshot.period.end;
  let supersededByNumber: string | null = null;
  if (cert.revoked_at) {
    status = "revoked";
  } else if (cert.superseded_at) {
    status = "superseded";
    if (cert.superseded_by) {
      const { data: next } = await db.from("business_venue_certificates").select("number").eq("id", cert.superseded_by).maybeSingle();
      supersededByNumber = str(next?.number);
    }
  } else {
    const { data: location, error: locError } = await db.from("business_locations").select(LOCATION_COLUMNS).eq("id", cert.location_id).maybeSingle();
    if (locError || !location) throw new Error("certificate_unavailable");
    const access = await liveAccess(db, location as LocationRow, now);
    if (access.active && access.end) {
      status = "valid";
      validUntil = Date.parse(access.end) > Date.parse(snapshot.period.end) ? access.end : snapshot.period.end;
    } else {
      status = "expired";
    }
  }
  return { number: cert.number, issuedAt: cert.issued_at, snapshot, status, validUntil, supersededByNumber };
}
