import BusinessPartnerLanding from "@/components/business-app/BusinessPartnerLanding";
import { requireBusinessCabinetPermission } from "@/lib/business-app/cabinet-mode.server";
import { normalizePartnerCode } from "@/lib/business/partner-codes";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function loadOffer(code: string) {
  try {
    const { data, error } = await createServiceRoleClient().rpc("business_partner_code_preview", { p_code: code });
    const row = !error && data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    if (!row || row.available !== true) return null;
    const unit = Number(row.unit_price_minor);
    const standard = Number(row.standard_unit_price_minor);
    const periods = Number(row.discount_periods);
    if (![unit, standard, periods].every(Number.isInteger) || unit % 100 !== 0 || standard % 100 !== 0) return null;
    return { code, unitPriceRub: unit / 100, standardUnitPriceRub: standard / 100, discountPeriods: periods };
  } catch {
    return null;
  }
}

/** https://business.audiolad.ru/podarok?code=XXXX-XXXX-XXXX – personal partner link (8142d69a). */
export default async function BusinessPartnerCodePage({ searchParams }: PageProps) {
  // The hall device never applies a code; it goes to its own fallback.
  await requireBusinessCabinetPermission("payLink");
  const query = await searchParams;
  const code = normalizePartnerCode(typeof query.code === "string" ? query.code : "");
  const offer = code ? await loadOffer(code) : null;
  const { data: { user } } = await (await createClient()).auth.getUser();

  if (!offer) {
    return (
      <section className="business-app-card mx-auto max-w-[640px] space-y-3" data-testid="biz-partner-landing-unavailable">
        <h1 className="text-[1.4rem] font-bold text-[var(--biz-text)]">Код недоступен</h1>
        <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
          Ссылка неполная, код уже закреплён за другим аккаунтом или отозван. Если код ваш, напишите нам – поможем.
        </p>
      </section>
    );
  }
  return <BusinessPartnerLanding key={offer.code} offer={offer} signedIn={Boolean(user)} />;
}
