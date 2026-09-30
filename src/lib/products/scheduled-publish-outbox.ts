export type ScheduledPublishOutboxEvent = {
  id: string;
  practiceId: string;
  authorId: string;
  practiceSlug: string;
  authorSlug: string;
  catalogVisibility: string | null;
  isCatalogListed: boolean | null;
  publishedAt: string;
  priorPublicCount: number;
};

export type ScheduledPublishDelivery = {
  delivered: string[];
  pending: string[];
};

type NotifyResult = boolean;

/**
 * Drain leased events. A thrown or unsuccessful notify leaves the event
 * pending so the next server run can deliver it. Successful ids are completed
 * once and are not returned again.
 */
export async function deliverPendingScheduledPublishEvents(input: {
  take: () => Promise<ScheduledPublishOutboxEvent[]>;
  complete: (ids: string[]) => Promise<void>;
  abandon: (ids: string[]) => Promise<void>;
  notify: (event: ScheduledPublishOutboxEvent) => Promise<NotifyResult>;
}): Promise<ScheduledPublishDelivery> {
  const events = await input.take();
  const delivered: string[] = [];
  const pending: string[] = [];

  for (const event of events) {
    try {
      const ok = await input.notify(event);
      if (ok) {
        delivered.push(event.id);
      } else {
        pending.push(event.id);
      }
    } catch {
      pending.push(event.id);
    }
  }

  if (delivered.length > 0) {
    await input.complete(delivered);
  }

  if (pending.length > 0) {
    await input.abandon(pending);
  }

  return { delivered, pending };
}

export type ScheduledPublishRole = "anon" | "authenticated" | "service_role";

export type MemoryScheduledPractice = {
  id: string;
  authorId: string;
  practiceSlug: string;
  authorSlug: string;
  catalogVisibility: string | null;
  isCatalogListed: boolean | null;
  status: string;
  scheduledPublishAt: string | null;
  publishedAt: string | null;
  deleted?: boolean;
};

type MemoryEvent = ScheduledPublishOutboxEvent & {
  status: "pending" | "leased" | "processed";
  leasedUntil: number | null;
};

const LEASE_MS = 2 * 60 * 1000;

/**
 * In-memory stand-in for the claim transaction and the outbox lease.
 * Claim returns a count. Product fields stay inside the store.
 */
export function createMemoryScheduledPublishStore(now: () => number = Date.now) {
  const events = new Map<string, MemoryEvent>();

  function assertServiceRole(role: ScheduledPublishRole) {
    if (role !== "service_role") {
      throw new Error("permission denied for scheduled publish claim");
    }
  }

  function claim(role: ScheduledPublishRole, practices: MemoryScheduledPractice[]): number {
    assertServiceRole(role);
    const due = practices.filter((practice) => {
      if (practice.deleted || practice.status !== "published") {
        return false;
      }

      if (practice.publishedAt || !practice.scheduledPublishAt) {
        return false;
      }

      if (!practice.practiceSlug || !practice.authorSlug) {
        return false;
      }

      return Date.parse(practice.scheduledPublishAt) <= now();
    });

    let inserted = 0;

    for (const practice of due) {
      if (events.has(practice.id) || practice.publishedAt) {
        continue;
      }

      const priorPublicCount = practices.filter((other) => {
        return (
          other.authorId === practice.authorId &&
          other.id !== practice.id &&
          !other.deleted &&
          other.publishedAt != null &&
          Date.parse(other.publishedAt) <= now()
        );
      }).length;

      practice.publishedAt = practice.scheduledPublishAt;
      events.set(practice.id, {
        id: practice.id,
        practiceId: practice.id,
        authorId: practice.authorId,
        practiceSlug: practice.practiceSlug,
        authorSlug: practice.authorSlug,
        catalogVisibility: practice.catalogVisibility,
        isCatalogListed: practice.isCatalogListed,
        publishedAt: practice.scheduledPublishAt ?? "",
        priorPublicCount,
        status: "pending",
        leasedUntil: null,
      });
      inserted += 1;
    }

    return inserted;
  }

  function take(role: ScheduledPublishRole): ScheduledPublishOutboxEvent[] {
    assertServiceRole(role);
    const taken: ScheduledPublishOutboxEvent[] = [];

    for (const event of events.values()) {
      const leaseExpired =
        event.status === "leased" &&
        event.leasedUntil != null &&
        event.leasedUntil <= now();

      if (event.status !== "pending" && !leaseExpired) {
        continue;
      }

      event.status = "leased";
      event.leasedUntil = now() + LEASE_MS;
      taken.push({
        id: event.id,
        practiceId: event.practiceId,
        authorId: event.authorId,
        practiceSlug: event.practiceSlug,
        authorSlug: event.authorSlug,
        catalogVisibility: event.catalogVisibility,
        isCatalogListed: event.isCatalogListed,
        publishedAt: event.publishedAt,
        priorPublicCount: event.priorPublicCount,
      });
    }

    return taken;
  }

  function complete(role: ScheduledPublishRole, ids: string[]) {
    assertServiceRole(role);

    for (const id of ids) {
      const event = events.get(id);

      if (event && event.status === "leased") {
        event.status = "processed";
        event.leasedUntil = null;
      }
    }
  }

  function abandon(role: ScheduledPublishRole, ids: string[]) {
    assertServiceRole(role);

    for (const id of ids) {
      const event = events.get(id);

      if (event && event.status === "leased") {
        event.status = "pending";
        event.leasedUntil = null;
      }
    }
  }

  return {
    claim,
    take,
    complete,
    abandon,
    eventCount: () => events.size,
    pendingIds: () =>
      [...events.values()]
        .filter((event) => event.status === "pending")
        .map((event) => event.id),
  };
}
