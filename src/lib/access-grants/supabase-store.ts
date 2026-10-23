import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { accessGrantEventIsUnique, isAccessGrantEventName, type AccessGrantEventName } from "./events";
import type { GrantRow } from "./policy";
import type { AccessGrantStore, EventRow, PaidRow, PlaybackRow } from "./store";

type DbError = { message?: string; code?: string } | null;

function isUniqueViolation(error: DbError): boolean {
  return error?.code === "23505";
}

export class AccessGrantStoreError extends Error {
  constructor() {
    super("access_grant_store_unavailable");
    this.name = "AccessGrantStoreError";
  }
}

function unwrap<T>(result: { data: T; error: DbError }): T {
  if (result.error) throw new AccessGrantStoreError();
  return result.data;
}

function asGrant(row: Record<string, unknown> | null): GrantRow | null {
  if (!row) return null;
  if (typeof row.email_hash !== "string" || typeof row.user_id !== "string") return null;
  if (typeof row.kind !== "string" || typeof row.starts_at !== "string" || typeof row.ends_at !== "string") return null;
  return {
    emailHash: row.email_hash,
    userId: row.user_id,
    kind: row.kind,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

export function createSupabaseAccessGrantStore(): AccessGrantStore {
  let db: ReturnType<typeof createServiceRoleClient>;
  try {
    db = createServiceRoleClient();
  } catch {
    throw new AccessGrantStoreError();
  }

  return {
    async resolveGrant(emailHash, userId, kind) {
      const result = await db.rpc("resolve_access_grant", {
        p_email_hash: emailHash, p_user_id: userId, p_kind: kind,
      });
      const rows = unwrap(result) as Record<string, unknown>[] | null;
      return asGrant(rows?.[0] ?? null);
    },
    async insertGrant(row) {
      const result = await db.rpc("insert_access_grant", {
        p_email_hash: row.emailHash, p_user_id: row.userId, p_kind: row.kind,
        p_starts_at: row.startsAt, p_ends_at: row.endsAt,
      });
      return unwrap(result) === true ? "inserted" : "exists";
    },
    async findPaidUntil(emailHash, userId, kind) {
      const byEmail = await db
        .from("access_paid_periods")
        .select("paid_until")
        .eq("email_hash", emailHash)
        .eq("kind", kind)
        .maybeSingle();
      const emailRow = unwrap(byEmail) as { paid_until?: string } | null;
      const byUser = await db
        .from("access_paid_periods")
        .select("paid_until")
        .eq("user_id", userId)
        .eq("kind", kind);
      const userRows = unwrap(byUser) as { paid_until?: string }[] | null;
      const stamps = [emailRow?.paid_until, ...(userRows ?? []).map((row) => row.paid_until)].filter(
        (value): value is string => typeof value === "string",
      );
      if (stamps.length === 0) return null;
      return stamps.reduce((max, value) => (Date.parse(value) > Date.parse(max) ? value : max));
    },
    async upsertPaid(row: PaidRow) {
      const { error } = await db.from("access_paid_periods").upsert(
        {
          email_hash: row.emailHash,
          user_id: row.userId,
          kind: row.kind,
          paid_until: row.paidUntil,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email_hash,kind", ignoreDuplicates: true },
      );
      if (error) throw new AccessGrantStoreError();
      // Atomic predicate is rechecked after a concurrent updater releases its row lock.
      const updated = await db.from("access_paid_periods")
        .update({ paid_until: row.paidUntil, updated_at: new Date().toISOString() })
        .eq("email_hash", row.emailHash).eq("kind", row.kind)
        .lt("paid_until", row.paidUntil);
      unwrap(updated);
    },
    async listEvents(emailHash, kind) {
      const result = await db
        .from("access_grant_events")
        .select("email_hash, user_id, kind, event_name, occurred_at")
        .eq("email_hash", emailHash)
        .eq("kind", kind);
      const rows = unwrap(result) as Record<string, unknown>[] | null;
      const events: EventRow[] = [];
      for (const row of rows ?? []) {
        if (typeof row.event_name !== "string" || !isAccessGrantEventName(row.event_name)) continue;
        if (typeof row.email_hash !== "string" || typeof row.user_id !== "string") continue;
        events.push({
          emailHash: row.email_hash,
          userId: row.user_id,
          kind: typeof row.kind === "string" ? row.kind : kind,
          name: row.event_name,
          at: typeof row.occurred_at === "string" ? row.occurred_at : new Date(0).toISOString(),
        });
      }
      return events;
    },
    async insertEvent(row) {
      const { error } = await db.from("access_grant_events").insert({
        email_hash: row.emailHash,
        user_id: row.userId,
        kind: row.kind,
        event_name: row.name,
        occurred_at: row.at,
      });
      if (!error) return "inserted";
      if (isUniqueViolation(error) && accessGrantEventIsUnique(row.name as AccessGrantEventName)) return "exists";
      throw new AccessGrantStoreError();
    },
    async readPlayback(userId, spaceId) {
      const result = await db
        .from("business_workspace_playback")
        .select("user_id, space_id, track_index, position_seconds, volume, updated_at")
        .eq("user_id", userId)
        .eq("space_id", spaceId)
        .maybeSingle();
      const row = unwrap(result) as Record<string, unknown> | null;
      if (!row) return null;
      const index = Number(row.track_index ?? 0);
      const positionSec = Number(row.position_seconds ?? 0);
      const volume = Number(row.volume ?? 0.8);
      return {
        userId,
        spaceId,
        index: Number.isFinite(index) ? index : 0,
        positionSec: Number.isFinite(positionSec) ? positionSec : 0,
        volume: Number.isFinite(volume) ? volume : 0.8,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
      };
    },
    async writePlayback(row: PlaybackRow) {
      const { error } = await db.from("business_workspace_playback").upsert(
        {
          user_id: row.userId,
          space_id: row.spaceId,
          track_index: row.index,
          position_seconds: row.positionSec,
          volume: row.volume,
          updated_at: row.updatedAt,
        },
        { onConflict: "user_id,space_id" },
      );
      if (error) throw new AccessGrantStoreError();
    },
  };
}
