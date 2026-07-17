import type { ApplicationEmailMessageType } from "./message-types";
import type { EmailOutboxStatus } from "./types";

export type EnqueueEmailInput = {
  messageType: ApplicationEmailMessageType;
  contactId: string;
  userId?: string | null;
  toEmail: string;
  templateKey: string;
  templateVersion: string;
  payload?: Record<string, unknown>;
  priority?: number;
  scheduledAt?: string;
  deduplicationKey?: string | null;
};

export type EnqueueEmailResult =
  | { ok: true; outboxId: string; status: EmailOutboxStatus }
  | { ok: false; code: "worker_not_enabled" | "suppressed" | "invalid_input" };

/**
 * Application email enqueue stub.
 * Worker/cron are intentionally not connected yet.
 */
export async function enqueueApplicationEmail(
  input: EnqueueEmailInput,
): Promise<EnqueueEmailResult> {
  void input;
  return {
    ok: false,
    code: "worker_not_enabled",
  };
}
