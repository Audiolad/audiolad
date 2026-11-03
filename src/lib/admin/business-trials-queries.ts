import "server-only";

import {
  buildBusinessTrialStats,
  earliestBusinessTrialDay,
  businessTrialFunnelFrom,
  latestIso,
  type BusinessTrialActivityDay,
  type BusinessTrialFacts,
  type BusinessTrialGrantInput,
  type BusinessTrialOrigin,
  type BusinessTrialStats,
} from "@/lib/admin/business-trials";
import { BUSINESS_NEW_CLIENT_GRANT_KIND } from "@/lib/access-grants/policy";
import { businessTrialExcludedOrgIds } from "@/lib/admin/business-trials-excluded";
import { businessTrialActivityConfig } from "@/lib/business-trial-activity/config";
import { businessTrialAttributionConfig } from "@/lib/business-trial-attribution/config";
import { loadMaxPotokFunnel } from "@/lib/admin/max-potok-funnel.server";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { selectInPaged, type BusinessTrialsDb, type SelectInOptions } from "@/lib/admin/business-trials-select";

/**
 * Read-only loader for «Подарочная неделя» (task 253821e0). SELECT only, service role.
 * Email hashes are used only to join access_paid_periods and are dropped here:
 * the page gets names, short ids, dates and statuses, no email, IP or hashes.
 */

type Db = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function selectIn(
  db: Db,
  table: string,
  columns: string,
  column: string,
  values: readonly string[],
  options: SelectInOptions,
): Promise<Row[]> {
  return selectInPaged(db as unknown as BusinessTrialsDb, table, columns, column, values, options);
}

const ATTRIBUTION_COLUMNS =
  "attributed_at, entry_channel, referrer_domain, utm_source, utm_medium, utm_campaign, geo_country, geo_region, geo_city, device_class, os_family, browser_family";

export function businessTrialOriginFromRow(row: Row): BusinessTrialOrigin {
  const channel = row.entry_channel === "max" || row.entry_channel === "tg" ? row.entry_channel : null;
  const device = row.device_class === "phone" || row.device_class === "tablet" || row.device_class === "computer" ? row.device_class : null;
  return {
    channel,
    referrerDomain: str(row.referrer_domain),
    utmSource: str(row.utm_source),
    utmMedium: str(row.utm_medium),
    utmCampaign: str(row.utm_campaign),
    country: str(row.geo_country),
    region: str(row.geo_region),
    city: str(row.geo_city),
    deviceClass: device,
    osFamily: str(row.os_family),
    browserFamily: str(row.browser_family),
  };
}

export async function loadBusinessTrialStats(now: Date = new Date()): Promise<BusinessTrialStats> {
  const db = createServiceRoleClient();
  // PR 2 columns exist only after migration 20270213120000: read them only with the flag on.
  const config = businessTrialActivityConfig(process.env);
  const activity = { enabled: config.enabled, activeMinutes: config.activeMinutes };
  const excludedOrgIds = businessTrialExcludedOrgIds(process.env);
  // PR 3 columns exist only after migration 20270214120000: read them only with that flag on.
  const attributionEnabled = businessTrialAttributionConfig(process.env).enabled;

  const grantRows = await fetchAllPages<Row>((from, to) =>
    db
      .from("access_grants")
      .select("user_id, email_hash, kind, starts_at, ends_at")
      .eq("kind", BUSINESS_NEW_CLIENT_GRANT_KIND)
      .order("starts_at", { ascending: false })
      .order("user_id", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  );

  const grants: BusinessTrialGrantInput[] = [];
  const userByHash = new Map<string, string>();
  for (const row of grantRows) {
    const userId = str(row.user_id);
    const startsAt = str(row.starts_at);
    const endsAt = str(row.ends_at);
    if (!userId || !startsAt || !endsAt) continue;
    const hash = str(row.email_hash);
    if (hash) userByHash.set(hash, userId);
    grants.push({ userId, hasEmail: Boolean(hash), kind: String(row.kind), startsAt, endsAt });
  }

  const facts = new Map<string, BusinessTrialFacts>();
  const factsOf = (userId: string): BusinessTrialFacts => {
    let value = facts.get(userId);
    if (!value) {
      value = {};
      facts.set(userId, value);
    }
    return value;
  };
  const userIds = [...new Set(grants.map((grant) => grant.userId))];
  // Bot counts use the funnel window, not the first start, and load even before any start.
  const funnelFrom = businessTrialFunnelFrom(now);
  if (userIds.length === 0) {
    const maxPotokOnly = attributionEnabled ? await loadMaxPotokFunnel(funnelFrom) : null;
    return buildBusinessTrialStats({ now, grants, facts, activity, excludedOrgIds, attributionEnabled, maxPotok: maxPotokOnly });
  }

  const kindFilter = { kind: BUSINESS_NEW_CLIENT_GRANT_KIND };
  const guestStartColumns = [
    "user_id, organization_id, status",
    config.enabled ? ", start_host" : "",
    attributionEnabled ? `, ${ATTRIBUTION_COLUMNS}` : "",
  ].join("");
  const [paidByUser, paidByHash, events, guestStarts, members, playback, maxPotok] = await Promise.all([
    selectIn(db, "access_paid_periods", "user_id, paid_until", "user_id", userIds, { eq: kindFilter, order: ["email_hash"] }),
    selectIn(db, "access_paid_periods", "email_hash, paid_until", "email_hash", [...userByHash.keys()], { eq: kindFilter, order: ["email_hash"] }),
    selectIn(db, "access_grant_events", "user_id, event_name", "user_id", userIds, {
      eq: { kind: BUSINESS_NEW_CLIENT_GRANT_KIND, event_name: "first_useful_action" },
      order: ["id"],
    }),
    selectIn(
      db,
      "business_guest_starts",
      guestStartColumns,
      "user_id",
      userIds,
      { eq: { status: "ready" }, order: ["id"] },
    ),
    selectIn(db, "business_organization_members", "user_id, organization_id, created_at", "user_id", userIds, { eq: { role: "owner" }, order: ["id"] }),
    selectIn(db, "business_workspace_playback", "user_id, updated_at", "user_id", userIds, { order: ["user_id", "space_id"] }),
    attributionEnabled ? loadMaxPotokFunnel(funnelFrom) : Promise.resolve(null),
  ]);

  for (const row of paidByUser) {
    const userId = str(row.user_id);
    if (userId) factsOf(userId).paidUntil = latestIso(factsOf(userId).paidUntil, str(row.paid_until));
  }
  for (const row of paidByHash) {
    const hash = str(row.email_hash);
    const userId = hash ? userByHash.get(hash) : undefined;
    if (userId) factsOf(userId).paidUntil = latestIso(factsOf(userId).paidUntil, str(row.paid_until));
  }
  userByHash.clear();
  for (const row of events) {
    const userId = str(row.user_id);
    if (userId) factsOf(userId).firstUsefulAction = true;
  }
  for (const row of playback) {
    const userId = str(row.user_id);
    if (userId) factsOf(userId).workspacePlaybackAt = latestIso(factsOf(userId).workspacePlaybackAt, str(row.updated_at));
  }

  // Venue of the account: guest-start organization first, else the earliest owner membership.
  const orgByUser = new Map<string, string>();
  for (const row of guestStarts) {
    const userId = str(row.user_id);
    if (!userId) continue;
    factsOf(userId).guestStart = true;
    const host = row.start_host;
    if (host === "coffee" || host === "business") factsOf(userId).startHost = host;
    if (attributionEnabled && str(row.attributed_at)) factsOf(userId).origin = businessTrialOriginFromRow(row);
    const orgId = str(row.organization_id);
    if (orgId) orgByUser.set(userId, orgId);
  }
  const sortedMembers = [...members].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const row of sortedMembers) {
    const userId = str(row.user_id);
    const orgId = str(row.organization_id);
    if (userId && orgId && !orgByUser.has(userId)) orgByUser.set(userId, orgId);
  }

  const orgIds = [...new Set(orgByUser.values())];
  if (orgIds.length > 0) {
    // Activity rows older than the earliest gift start are never used: skip them in SQL.
    const earliestDay = earliestBusinessTrialDay(grants);
    const [orgs, sessions, heartbeats, activityRows] = await Promise.all([
      selectIn(db, "business_organizations", "id, name", "id", orgIds, { order: ["id"] }),
      selectIn(db, "business_point_sessions", "organization_id, last_seen_at", "organization_id", orgIds, { order: ["id"] }),
      selectIn(db, "business_player_device_heartbeat", "organization_id, last_seen_at", "organization_id", orgIds, { order: ["player_id"] }),
      config.enabled && earliestDay
        ? selectIn(db, "business_trial_activity_days", "organization_id, day, listened_seconds, cabinet_visits", "organization_id", orgIds, {
            order: ["organization_id", "day"],
            gte: { day: earliestDay },
          })
        : Promise.resolve([] as Row[]),
    ]);
    const daysByOrg = new Map<string, BusinessTrialActivityDay[]>();
    for (const row of activityRows) {
      const id = str(row.organization_id);
      const day = str(row.day);
      if (!id || !day) continue;
      const list = daysByOrg.get(id) ?? [];
      list.push({ day, listenedSeconds: Number(row.listened_seconds) || 0, cabinetVisits: Number(row.cabinet_visits) || 0 });
      daysByOrg.set(id, list);
    }
    const nameByOrg = new Map<string, string>();
    for (const row of orgs) {
      const id = str(row.id);
      const name = str(row.name);
      if (id && name) nameByOrg.set(id, name);
    }
    const latestBy = (rows: Row[]) => {
      const map = new Map<string, string | null>();
      for (const row of rows) {
        const id = str(row.organization_id);
        if (id) map.set(id, latestIso(map.get(id), str(row.last_seen_at)));
      }
      return map;
    };
    const pointByOrg = latestBy(sessions);
    const deviceByOrg = latestBy(heartbeats);
    for (const [userId, orgId] of orgByUser) {
      const value = factsOf(userId);
      value.organizationId = orgId;
      value.organizationName = nameByOrg.get(orgId) ?? null;
      value.pointSeenAt = pointByOrg.get(orgId) ?? null;
      value.deviceSeenAt = deviceByOrg.get(orgId) ?? null;
      value.activityDays = daysByOrg.get(orgId) ?? [];
    }
  }

  return buildBusinessTrialStats({ now, grants, facts, activity, excludedOrgIds, attributionEnabled, maxPotok });
}
