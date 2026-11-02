import "server-only";

import {
  buildBusinessTrialStats,
  latestIso,
  type BusinessTrialFacts,
  type BusinessTrialGrantInput,
  type BusinessTrialStats,
} from "@/lib/admin/business-trials";
import { BUSINESS_NEW_CLIENT_GRANT_KIND } from "@/lib/access-grants/policy";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { selectInPaged, type BusinessTrialsDb, type SelectInOptions } from "@/lib/admin/business-trials-select";

/**
 * Read-only loader for «Подарочная неделя» (task 253821e0). SELECT only, service role.
 * Email hashes are used only to join access_paid_periods and are dropped here:
 * the page gets names, short ids, dates and statuses, no email, IP or hashes.
 */

// 50 sha256 hex values keep the PostgREST GET URL well under common 8 KB proxy limits.
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

export async function loadBusinessTrialStats(now: Date = new Date()): Promise<BusinessTrialStats> {
  const db = createServiceRoleClient();

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
  if (userIds.length === 0) return buildBusinessTrialStats({ now, grants, facts });

  const kindFilter = { kind: BUSINESS_NEW_CLIENT_GRANT_KIND };
  const [paidByUser, paidByHash, events, guestStarts, members, playback] = await Promise.all([
    selectIn(db, "access_paid_periods", "user_id, paid_until", "user_id", userIds, { eq: kindFilter, order: ["email_hash"] }),
    selectIn(db, "access_paid_periods", "email_hash, paid_until", "email_hash", [...userByHash.keys()], { eq: kindFilter, order: ["email_hash"] }),
    selectIn(db, "access_grant_events", "user_id, event_name", "user_id", userIds, {
      eq: { kind: BUSINESS_NEW_CLIENT_GRANT_KIND, event_name: "first_useful_action" },
      order: ["id"],
    }),
    selectIn(db, "business_guest_starts", "user_id, organization_id, status", "user_id", userIds, { eq: { status: "ready" }, order: ["id"] }),
    selectIn(db, "business_organization_members", "user_id, organization_id, created_at", "user_id", userIds, { eq: { role: "owner" }, order: ["id"] }),
    selectIn(db, "business_workspace_playback", "user_id, updated_at", "user_id", userIds, { order: ["user_id", "space_id"] }),
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
    const [orgs, sessions, heartbeats] = await Promise.all([
      selectIn(db, "business_organizations", "id, name", "id", orgIds, { order: ["id"] }),
      selectIn(db, "business_point_sessions", "organization_id, last_seen_at", "organization_id", orgIds, { order: ["id"] }),
      selectIn(db, "business_player_device_heartbeat", "organization_id, last_seen_at", "organization_id", orgIds, { order: ["player_id"] }),
    ]);
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
      value.organizationName = nameByOrg.get(orgId) ?? null;
      value.pointSeenAt = pointByOrg.get(orgId) ?? null;
      value.deviceSeenAt = deviceByOrg.get(orgId) ?? null;
    }
  }

  return buildBusinessTrialStats({ now, grants, facts });
}
