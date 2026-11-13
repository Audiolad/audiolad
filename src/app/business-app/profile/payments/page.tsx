import type { Metadata } from "next";
import Link from "next/link";

import BusinessPaymentHistoryList from "@/components/business-app/profile/BusinessPaymentHistoryList";
import { requireBusinessCabinetPermission } from "@/lib/business-app/cabinet-mode.server";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { BUSINESS_PAYMENT_HISTORY_LINK_LABEL, type BusinessPaymentHistoryView } from "@/lib/business-app/payment-history";
import { loadBusinessPaymentHistory } from "@/lib/business-app/payment-history.server";
import { getHostnameFromHeaders } from "@/lib/business-app/host";
import { buildNamedBusinessPageMetadata } from "@/lib/business-app/seo";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildNamedBusinessPageMetadata(getHostnameFromHeaders(await headers()), "История оплат");
}

/** Owner «История оплат» (Sergey t1342u). Read-only; only the owner's own organization. */
export default async function BusinessPaymentHistoryPage() {
  await requireBusinessCabinetPermission("sectionProfile");
  const domain = await loadBusinessOwnerHomeContext();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let state: "anonymous" | "not_owner" | "error" | "ready" = "anonymous";
  let view: BusinessPaymentHistoryView = { items: [], totalRub: 0 };
  if (domain.status === "authenticated" && user) {
    // The caller's own session (RLS) proves the owner role before any service-role read.
    const { data: membership } = domain.organizationId
      ? await supabase.from("business_organization_members").select("role")
        .eq("organization_id", domain.organizationId).eq("user_id", user.id).maybeSingle()
      : { data: null };
    if (domain.organizationId && membership?.role === "owner") {
      try {
        view = await loadBusinessPaymentHistory({ userId: user.id, organizationId: domain.organizationId });
        state = "ready";
      } catch {
        state = "error";
      }
    } else {
      state = "not_owner";
    }
  }

  return (
    <div className="business-app-span-full mx-auto max-w-3xl space-y-4" data-testid="biz-payment-history">
      <p>
        <Link className="underline" href="/profile#podpiska" data-testid="biz-payment-history-back">← Профиль</Link>
      </p>
      <header>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)]">{BUSINESS_PAYMENT_HISTORY_LINK_LABEL}</h1>
      </header>
      <section className="business-app-card space-y-3">
        {state === "ready" ? <BusinessPaymentHistoryList view={view} /> : null}
        {state === "anonymous" ? <p>Войдите в аккаунт, чтобы видеть оплаты.</p> : null}
        {state === "not_owner" ? <p>История оплат доступна владельцу заведения.</p> : null}
        {state === "error" ? <p>Не получилось загрузить оплаты. Обновите страницу через минуту.</p> : null}
      </section>
    </div>
  );
}
