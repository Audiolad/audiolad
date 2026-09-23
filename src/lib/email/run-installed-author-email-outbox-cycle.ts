import { processAuthorPartnerActivationEmailOutbox } from "@/lib/email/process-author-partner-activation-email";
import { processAuthorSaleEmailOutbox } from "@/lib/email/process-author-sale-email-outbox";

export type EmailOutboxCounts = {
  claimed: number;
  sent: number;
  failed: number;
};

export type EmailOutboxQueueResult =
  | { ok: true; result: EmailOutboxCounts }
  | { ok: false; error: unknown };

export type InstalledAuthorEmailOutboxCycleResult = {
  sale: EmailOutboxQueueResult;
  partner: EmailOutboxQueueResult;
};

type SaleOptions = NonNullable<Parameters<typeof processAuthorSaleEmailOutbox>[0]>;
type PartnerOptions = NonNullable<
  Parameters<typeof processAuthorPartnerActivationEmailOutbox>[0]
>;

/**
 * One tick of the already installed audiolad-author-sale-email-outbox.timer.
 * The host wrapper keeps calling `npm run run:author-sale-email-outbox` from
 * the current release. This function drains the sale queue and the partner
 * activation queue in that same process.
 *
 * Each queue keeps its own claim / complete / fail lease. A thrown error in
 * one queue does not skip the other.
 */
export async function runInstalledAuthorEmailOutboxCycle(options?: {
  sale?: SaleOptions;
  partner?: PartnerOptions;
}): Promise<InstalledAuthorEmailOutboxCycleResult> {
  const [sale, partner] = await Promise.all([
    processAuthorSaleEmailOutbox(options?.sale)
      .then((result) => ({ ok: true as const, result }))
      .catch((error: unknown) => ({ ok: false as const, error })),
    processAuthorPartnerActivationEmailOutbox(options?.partner)
      .then((result) => ({ ok: true as const, result }))
      .catch((error: unknown) => ({ ok: false as const, error })),
  ]);

  return { sale, partner };
}

export type InstalledAuthorEmailOutboxCycleOutput = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Keep the installed wrapper's parser on the sale summary only.
 * That parser keeps the last line matching
 * `^{.*"claimed".*"sent".*"failed".*}$`.
 * Partner output is prefixed so it cannot replace the sale line.
 * Sale failure still exits non-zero and does not print a fake sale summary.
 */
export function formatInstalledAuthorEmailOutboxCycle(
  result: InstalledAuthorEmailOutboxCycleResult,
): InstalledAuthorEmailOutboxCycleOutput {
  const stderrLines: string[] = [];
  if (result.partner.ok) {
    stderrLines.push(
      `partner_activation_email_outbox ${JSON.stringify(result.partner.result)}`,
    );
  } else {
    const message =
      result.partner.error instanceof Error
        ? result.partner.error.message
        : "author_partner_activation_email_outbox_failed";
    stderrLines.push(`partner_activation_email_outbox_failed ${message}`);
  }

  if (!result.sale.ok) {
    stderrLines.push(
      result.sale.error instanceof Error
        ? result.sale.error.message
        : "author_sale_email_outbox_runner_failed",
    );
    return {
      stdout: "",
      stderr: stderrLines.join("\n"),
      exitCode: 1,
    };
  }

  return {
    stdout: JSON.stringify(result.sale.result),
    stderr: stderrLines.join("\n"),
    exitCode: 0,
  };
}

/** Same selection as deploy/scripts/run-author-sale-email-outbox.sh. */
export function saleWrapperSummaryLine(combinedOutput: string): string {
  let line = "";
  for (const candidate of combinedOutput.split("\n")) {
    if (/^\{.*"claimed".*"sent".*"failed".*\}$/.test(candidate)) {
      line = candidate;
    }
  }
  return line;
}
