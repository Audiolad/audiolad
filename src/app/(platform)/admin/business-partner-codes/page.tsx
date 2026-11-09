import BusinessPartnerCodesPanel from "@/components/admin/BusinessPartnerCodesPanel";
import {
  BUSINESS_PARTNER_CODES_HREF,
  buildPartnerCodeAdminRows,
  type PartnerCodeAdminRow,
  type PartnerCodeDbRow,
  type PartnerEntitlementDbRow,
  type PartnerPeriodDbRow,
} from "@/lib/admin/business-partner-codes";
import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

async function loadRows(): Promise<PartnerCodeAdminRow[] | null> {
  try {
    const db = createServiceRoleClient();
    const [codes, entitlements, periods, open] = await Promise.all([
      db.from("business_partner_codes")
        .select("id, code, purpose, recipient_note, unit_price_minor, discount_periods, created_at, reserved_until, bound_organization_id, bound_at, revoked_at")
        .order("created_at", { ascending: false })
        .limit(500),
      db.from("business_partner_entitlements").select("organization_id, code_id, first_paid_at"),
      db.from("business_partner_entitlement_periods").select("organization_id, period_index, venue_count, period_end"),
      db.from("business_subscription_order_scopes").select("partner_code_id, orders!inner(status)")
        .not("partner_code_id", "is", null).eq("orders.status", "pending"),
    ]);
    if (codes.error || entitlements.error || periods.error) return null;
    const orgIds = [...new Set((entitlements.data ?? []).map((row) => row.organization_id as string))];
    const names: Record<string, string> = {};
    if (orgIds.length) {
      const { data } = await db.from("business_organizations").select("id, name").in("id", orgIds);
      for (const row of data ?? []) names[row.id as string] = (row.name as string) ?? "";
    }
    const openIds = new Set(open.error ? [] : (open.data ?? []).map((row) => row.partner_code_id as string));
    return buildPartnerCodeAdminRows({
      codes: (codes.data ?? []) as PartnerCodeDbRow[],
      entitlements: (entitlements.data ?? []) as PartnerEntitlementDbRow[],
      periods: (periods.data ?? []) as PartnerPeriodDbRow[],
      organizationNames: names,
      openPaymentCodeIds: openIds,
      now: new Date(),
    });
  } catch {
    return null;
  }
}

/** «Партнёрские коды»: owner only. Codes, purpose, status, account and the personal-price periods. */
export default async function AdminBusinessPartnerCodesPage() {
  await requirePlatformOwnerAccess(BUSINESS_PARTNER_CODES_HREF);
  const rows = await loadRows();
  if (rows === null) console.error("admin_partner_codes_list_failed");
  return (
    <section aria-labelledby="admin-partner-codes-heading">
      <h2 id="admin-partner-codes-heading" className="text-[21px] font-semibold">Партнёрские коды</h2>
      <p className="mt-1 max-w-[760px] text-sm text-[#796ba0]">
        Персональные одноразовые коды АудиоЛад Бизнес: благодарность за кастдев и участникам десятки. Код
        закрепляется за одним аккаунтом при первой успешной оплате; цена за точку действует заданное число оплаченных
        периодов по 30 дней, затем – обычная. Создание кода ничего не списывает.
      </p>
      <div className="mt-5">
        {rows === null ? (
          <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
            Список кодов недоступен – возможно, миграция ещё не применена.
          </div>
        ) : (
          <BusinessPartnerCodesPanel rows={rows} />
        )}
      </div>
    </section>
  );
}
