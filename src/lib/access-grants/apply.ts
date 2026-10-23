import { BUSINESS_NEW_CLIENT_GRANT_KIND, decideTrialActivation, isPeriodActive, moscowCalendarDayIndex, resolveCustomerAccess, type CustomerAccess, type GrantRow } from "./policy";
import { eventsForAccessAction, type AccessActivityAction, type AccessGrantEventName } from "./events";
import { hashAccessEmail } from "./email-hash";
import type { AccessGrantStore } from "./store";

export type ActivationResult = {
  decision: "unconfirmed" | "issued" | "existing" | "paid_kept" | "invalid_email";
  access: CustomerAccess;
  grant: GrantRow | null;
  emailHash: string | null;
};

async function existingGrant(store: AccessGrantStore, emailHash: string, userId: string, kind: string) {
  return store.resolveGrant(emailHash, userId, kind);
}

/**
 * Issue at most one business gift. Confirmed email required.
 * A live paid period is not overwritten and does not receive a trial clock.
 */
export async function activateBusinessTrial(
  store: AccessGrantStore,
  input: { userId: string; email: string; now?: Date; kind?: string },
): Promise<ActivationResult> {
  const now = input.now ?? new Date();
  const kind = input.kind ?? BUSINESS_NEW_CLIENT_GRANT_KIND;
  const emailHash = hashAccessEmail(input.email);
  if (!emailHash) {
    return {
      decision: "invalid_email",
      access: { mode: "none", player: false, endsAt: null, daysLeft: null, grantKept: false },
      grant: null,
      emailHash: null,
    };
  }

  const existing = await existingGrant(store, emailHash, input.userId, kind);
  const paidUntil = await store.findPaidUntil(emailHash, input.userId, kind);
  const decision = decideTrialActivation({
    now,
    emailConfirmed: true,
    existing,
    paidUntil,
  });

  let grant = existing;
  if (decision.type === "issue") {
    const row: GrantRow = {
      emailHash,
      userId: input.userId,
      kind,
      startsAt: decision.startsAt,
      endsAt: decision.endsAt,
    };
    const inserted = await store.insertGrant(row);
    grant = await existingGrant(store, emailHash, input.userId, kind);
    if (inserted === "inserted") {
      await store.insertEvent({
        emailHash,
        userId: input.userId,
        kind,
        name: "trial_started",
        at: now.toISOString(),
      });
    }
  }

  const access = resolveCustomerAccess({
    now,
    emailConfirmed: true,
    grant,
    paidUntil,
  });

  const decisionName =
    decision.type === "paid_kept" ? "paid_kept" : decision.type === "issue" ? "issued" : "existing";

  return { decision: decisionName, access, grant, emailHash };
}

export async function recordAccessActivity(
  store: AccessGrantStore,
  input: {
    userId: string;
    email: string;
    now?: Date;
    action: AccessActivityAction;
    kind?: string;
  },
): Promise<AccessGrantEventName[]> {
  const now = input.now ?? new Date();
  const kind = input.kind ?? BUSINESS_NEW_CLIENT_GRANT_KIND;
  const emailHash = hashAccessEmail(input.email);
  if (!emailHash) return [];
  const grant = await existingGrant(store, emailHash, input.userId, kind);
  const paidUntil = await store.findPaidUntil(emailHash, input.userId, kind);
  const access = resolveCustomerAccess({ now, emailConfirmed: true, grant, paidUntil });
  const recorded = (await store.listEvents(emailHash, kind)).map((row) => row.name);
  const calendarDayIndex = grant ? moscowCalendarDayIndex(new Date(grant.startsAt), now) : null;
  const names = eventsForAccessAction({
    action: input.action,
    mode: access.mode,
    calendarDayIndex,
    recorded,
  });
  const fresh: AccessGrantEventName[] = [];
  for (const name of names) {
    const result = await store.insertEvent({
      emailHash,
      userId: input.userId,
      kind,
      name,
      at: now.toISOString(),
    });
    if (result === "inserted") fresh.push(name);
  }
  return fresh;
}

/**
 * Payment seam. Does not charge anyone. Keeps the trial row and its original end.
 * Call this from a future confirmed payment, not from a card form in this task.
 */
export async function recordPaidRenewal(
  store: AccessGrantStore,
  input: { userId: string; email: string; paidUntil: Date; now?: Date; kind?: string },
): Promise<CustomerAccess> {
  const now = input.now ?? new Date();
  const kind = input.kind ?? BUSINESS_NEW_CLIENT_GRANT_KIND;
  const emailHash = hashAccessEmail(input.email);
  if (!emailHash) {
    return { mode: "none", player: false, endsAt: null, daysLeft: null, grantKept: false };
  }
  await store.upsertPaid({
    emailHash,
    userId: input.userId,
    kind,
    paidUntil: input.paidUntil.toISOString(),
  });
  const paidUntil = await store.findPaidUntil(emailHash, input.userId, kind);
  if (paidUntil && isPeriodActive(paidUntil, now)) {
    await recordAccessActivity(store, { userId: input.userId, email: input.email, now, action: "renewal", kind });
  }
  const grant = await existingGrant(store, emailHash, input.userId, kind);
  return resolveCustomerAccess({
    now,
    emailConfirmed: true,
    grant,
    paidUntil,
  });
}
