import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Enqueue a canonical-sale notification. Delivery is deliberately handled by
 * the independent outbox runner, so a webhook never waits for SMTP.
 */
export async function notifyAuthorOfCanonicalSale(input: {
  orderId: string;
}): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.rpc("enqueue_author_sale_email", {
      p_sale_id: input.orderId,
    });
    if (error) {
      console.error("author_sale_email_enqueue_error");
    }
  } catch (error) {
    console.error(
      "author_sale_email_enqueue_unexpected_error",
      error instanceof Error ? error.name : "unknown",
    );
  }
}
