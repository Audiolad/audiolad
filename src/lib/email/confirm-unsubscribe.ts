import {
  planAuthorMarketingUnsubscribe,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe-token";

export type UnsubscribeStore = {
  listSuppressions(normalizedEmail: string): Promise<
    Array<{
      normalizedEmail: string;
      scope: string;
      reason: string;
      expiresAt?: string | null;
    }>
  >;
  insertSuppression(input: {
    normalizedEmail: string;
    scope: "author_marketing";
    reason: "unsubscribe";
    source: "user_unsubscribe";
  }): Promise<void>;
  revokeAuthorMarketing(normalizedEmail: string): Promise<void>;
};

export async function confirmAuthorMarketingUnsubscribe(input: {
  token: string;
  secret: string | null | undefined;
  now?: Date;
  store: UnsubscribeStore;
}): Promise<
  | { ok: true; already: boolean }
  | { ok: false; code: "not_configured" | "invalid" | "expired" }
> {
  const secret = input.secret?.trim() ?? "";
  if (!secret) {
    return { ok: false, code: "not_configured" };
  }

  const verified = verifyUnsubscribeToken({
    token: input.token,
    secret,
    now: input.now,
  });
  if (!verified.ok) {
    return verified;
  }

  const existing = await input.store.listSuppressions(verified.normalizedEmail);
  const plan = planAuthorMarketingUnsubscribe({
    normalizedEmail: verified.normalizedEmail,
    existing,
    now: input.now,
  });

  if (!plan.already) {
    await input.store.insertSuppression(plan);
  }

  await input.store.revokeAuthorMarketing(verified.normalizedEmail);
  return { ok: true, already: plan.already };
}
