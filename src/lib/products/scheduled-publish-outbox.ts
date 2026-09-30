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
  leaseToken: string;
};

export type ScheduledPublishDeliveryOutcome = "delivered" | "retry" | "dead";

export type ScheduledPublishDelivery = {
  delivered: string[];
  pending: string[];
  dead: string[];
};

/**
 * Yandex recrawl is delivered only when the integration is off or the URL
 * was accepted. Quota stays retryable. Configuration failures are dead-letter,
 * not a successful delivery.
 */
export function yandexDeliveryOutcome(status: string): ScheduledPublishDeliveryOutcome {
  if (status === "disabled" || status === "submitted" || status === "already_queued") {
    return "delivered";
  }

  if (
    status === "auth_failed" ||
    status === "invalid_user_id" ||
    status === "host_not_verified"
  ) {
    return "dead";
  }

  return "retry";
}

/**
 * Drain leased events. Retry and a thrown notify leave the event pending.
 * Dead-letter is not a successful delivery and is not taken again.
 * External APIs are at-least-once: one durable event, safe repeats.
 */
export async function deliverPendingScheduledPublishEvents(input: {
  take: () => Promise<ScheduledPublishOutboxEvent[]>;
  complete: (events: ScheduledPublishOutboxEvent[]) => Promise<void>;
  abandon: (events: ScheduledPublishOutboxEvent[]) => Promise<void>;
  deadLetter: (events: ScheduledPublishOutboxEvent[]) => Promise<void>;
  notify: (event: ScheduledPublishOutboxEvent) => Promise<ScheduledPublishDeliveryOutcome>;
}): Promise<ScheduledPublishDelivery> {
  const events = await input.take();
  const delivered: ScheduledPublishOutboxEvent[] = [];
  const pending: ScheduledPublishOutboxEvent[] = [];
  const dead: ScheduledPublishOutboxEvent[] = [];

  for (const event of events) {
    try {
      const outcome = await input.notify(event);

      if (outcome === "delivered") {
        delivered.push(event);
      } else if (outcome === "dead") {
        dead.push(event);
      } else {
        pending.push(event);
      }
    } catch {
      pending.push(event);
    }
  }

  if (delivered.length > 0) {
    await input.complete(delivered);
  }

  if (dead.length > 0) {
    await input.deadLetter(dead);
  }

  if (pending.length > 0) {
    await input.abandon(pending);
  }

  return {
    delivered: delivered.map((event) => event.id),
    pending: pending.map((event) => event.id),
    dead: dead.map((event) => event.id),
  };
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

type MemoryEvent = Omit<ScheduledPublishOutboxEvent, "leaseToken"> & {
  status: "pending" | "leased" | "processed" | "dead";
  leaseToken: string | null;
  leasedUntil: number | null;
};

const LEASE_MS = 15 * 60 * 1000;
const TAKE_LIMIT = 5;

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
        leaseToken: null,
        leasedUntil: null,
      });
      inserted += 1;
    }

    return inserted;
  }

  function matchesLease(
    event: MemoryEvent | undefined,
    claim: ScheduledPublishOutboxEvent,
  ): event is MemoryEvent {
    return (
      event != null &&
      event.status === "leased" &&
      event.leaseToken != null &&
      event.leaseToken === claim.leaseToken
    );
  }

  function take(role: ScheduledPublishRole): ScheduledPublishOutboxEvent[] {
    assertServiceRole(role);
    const taken: ScheduledPublishOutboxEvent[] = [];

    for (const event of events.values()) {
      if (taken.length >= TAKE_LIMIT) {
        break;
      }

      const leaseExpired =
        event.status === "leased" &&
        event.leasedUntil != null &&
        event.leasedUntil <= now();

      if (event.status !== "pending" && !leaseExpired) {
        continue;
      }

      const leaseToken = crypto.randomUUID();
      event.status = "leased";
      event.leaseToken = leaseToken;
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
        leaseToken,
      });
    }

    return taken;
  }

  function complete(role: ScheduledPublishRole, claimed: ScheduledPublishOutboxEvent[]) {
    assertServiceRole(role);

    for (const claim of claimed) {
      const event = events.get(claim.id);

      if (!matchesLease(event, claim)) {
        continue;
      }

      event.status = "processed";
      event.leaseToken = null;
      event.leasedUntil = null;
    }
  }

  function abandon(role: ScheduledPublishRole, claimed: ScheduledPublishOutboxEvent[]) {
    assertServiceRole(role);

    for (const claim of claimed) {
      const event = events.get(claim.id);

      if (!matchesLease(event, claim)) {
        continue;
      }

      event.status = "pending";
      event.leaseToken = null;
      event.leasedUntil = null;
    }
  }

  function deadLetter(role: ScheduledPublishRole, claimed: ScheduledPublishOutboxEvent[]) {
    assertServiceRole(role);

    for (const claim of claimed) {
      const event = events.get(claim.id);

      if (!matchesLease(event, claim)) {
        continue;
      }

      event.status = "dead";
      event.leaseToken = null;
      event.leasedUntil = null;
    }
  }

  return {
    claim,
    take,
    complete,
    abandon,
    deadLetter,
    eventCount: () => events.size,
    pendingIds: () =>
      [...events.values()]
        .filter((event) => event.status === "pending")
        .map((event) => event.id),
  };
}
