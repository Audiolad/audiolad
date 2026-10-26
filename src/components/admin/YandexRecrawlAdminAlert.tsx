import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { shouldAlertYandexStale } from "@/lib/seo/search-recrawl/policy";

async function loadYandexRecrawlStale(): Promise<boolean> {
  const now = Date.now();

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("search_recrawl_yandex_health");
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row || typeof row !== "object") {
      return false;
    }

    const record = row as {
      pending_count?: unknown;
      oldest_pending_at?: unknown;
      last_delivered_at?: unknown;
    };
    const pendingCount =
      typeof record.pending_count === "number" ? record.pending_count : 0;
    const oldestParsed =
      typeof record.oldest_pending_at === "string"
        ? Date.parse(record.oldest_pending_at)
        : Number.NaN;
    const lastParsed =
      typeof record.last_delivered_at === "string"
        ? Date.parse(record.last_delivered_at)
        : Number.NaN;
    const stale = shouldAlertYandexStale({
      pendingCount,
      oldestPendingAt: Number.isFinite(oldestParsed) ? oldestParsed : null,
      lastDeliveredAt: Number.isFinite(lastParsed) ? lastParsed : null,
      now,
    });

    if (stale) {
      console.error(
        `[yandex-webmaster] ${new Date(now).toISOString()} alert_no_success`,
        {
          pending: pendingCount,
          oldestPendingAt: record.oldest_pending_at ?? null,
          lastDeliveredAt: record.last_delivered_at ?? null,
        },
      );
    }

    return stale;
  } catch {
    return false;
  }
}

/**
 * Admin-only signal. Reads counts, never URLs or secrets.
 * Renders nothing when Yandex delivery is current or the read fails.
 */
export async function YandexRecrawlAdminAlert() {
  const stale = await loadYandexRecrawlStale();

  if (!stale) {
    return null;
  }

  return (
    <div
      role="alert"
      className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]"
    >
      <p>
        Яндекс.Вебмастер не принимал переобход audiolad.ru больше 24 часов.
        В очереди есть адреса, которые ещё не отправлены.
      </p>
    </div>
  );
}
