import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";

import { getHostnameFromHeaders } from "@/lib/business-app/host";
import { businessAuthHref } from "@/lib/access-grants/paths";

import { signOut } from "@/app/(platform)/auth/sign-out/actions";
import SignOutForm from "@/components/auth/SignOutForm";
import ProfileHelpContact from "@/components/business-app/ProfileHelpContact";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { buildBusinessAppPageMetadata } from "@/lib/business-app/seo";
import BusinessProfileForm from "@/components/business-app/profile/BusinessProfileForm";
import BusinessProfileSubscription from "@/components/business-app/profile/BusinessProfileSubscription";
import { businessKindLabel, businessTimezoneLabel } from "@/lib/business-app/profile";
import { extractBusinessFirstName } from "@/lib/business-app/domain-identity";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessCabinetPermission } from "@/lib/business-app/cabinet-mode.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildBusinessAppPageMetadata(),
  title: "Профиль – АудиоЛад Бизнес",
  robots: { index: false, follow: false },
};

export default async function BusinessProfilePage() {
  // Not on the hall device without a fresh owner password, not in the preview (cabinet-mode.ts).
  await requireBusinessCabinetPermission("sectionProfile");
  const hostname = getHostnameFromHeaders(await headers());
  const domain = await loadBusinessOwnerHomeContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.trim() || null;

  const meta = user?.user_metadata ?? {};
  const ownerName = extractBusinessFirstName({ metadataFirstName: meta.first_name, fullName: meta.full_name });
  const { data: membership } = domain.status === "authenticated" && domain.organizationId && user
    ? await supabase.from("business_organization_members").select("role")
      .eq("organization_id", domain.organizationId).eq("user_id", user.id).maybeSingle()
    : { data: null };

  return (
    <div className="business-app-span-full mx-auto max-w-3xl space-y-4" data-testid="biz-profile">
      <header>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)]">Профиль</h1>
      </header>

      {domain.status === "anonymous" ? (
        <section className="business-app-card space-y-3">
          <p>Войдите в аккаунт, чтобы видеть кофейню и документы.</p>
          <div className="flex flex-wrap gap-2">
            <a className="business-app-btn business-app-btn-primary business-app-focus-ring" href={businessAuthHref(hostname, "sign-in")}>
              Войти
            </a>
            <a className="business-app-btn business-app-btn-secondary business-app-focus-ring" href={businessAuthHref(hostname, "sign-up")}>
              Регистрация
            </a>
          </div>
        </section>
      ) : (
        <section className="business-app-card space-y-3">
          <BusinessProfileForm ownerName={ownerName} venueName={domain.location?.name ?? null} canEditVenue={membership?.role === "owner"} />
          <dl className="space-y-2 text-sm">
            {email ? (
              <div>
                <dt className="text-[var(--biz-text-muted)]">Почта</dt>
                <dd className="font-semibold text-[var(--biz-text)]">{email}</dd>
              </div>
            ) : null}
            {domain.location ? (
              <>
                {domain.location.businessCategory ? (
                  <div>
                    <dt className="text-[var(--biz-text-muted)]">Направление</dt>
                    <dd className="font-semibold text-[var(--biz-text)]">{businessKindLabel(domain.location.businessCategory)}</dd>
                  </div>
                ) : null}
                {domain.location.timezone ? (
                  <div>
                    <dt className="text-[var(--biz-text-muted)]">Часовой пояс</dt>
                    <dd className="font-semibold text-[var(--biz-text)]">{businessTimezoneLabel(domain.location.timezone)}</dd>
                  </div>
                ) : null}
              </>
            ) : (
              <div>
                <dt className="text-[var(--biz-text-muted)]">Кофейня</dt>
                <dd className="font-semibold text-[var(--biz-text)]">Кофейня ещё не подключена.</dd>
              </div>
            )}
          </dl>
          {domain.location ? null : (
            <p>
              <Link className="business-app-btn business-app-btn-primary business-app-focus-ring" href="/onboarding">
                Подключить кофейню
              </Link>
            </p>
          )}
          <BusinessProfileSubscription offerAccepted={domain.offerAccepted} timezone={domain.location?.timezone || "Europe/Moscow"} nowIso={new Date().toISOString()} />
          <SignOutForm action={signOut}>
            <button type="submit" className="business-app-btn business-app-btn-secondary business-app-focus-ring">
              Выйти
            </button>
          </SignOutForm>
        </section>
      )}

      <section className="business-app-card space-y-3" data-testid="biz-profile-help-section">
        <ProfileHelpContact />
        <p>
          <Link className="underline" href="/help" data-testid="biz-profile-help">
            Помощь
          </Link>
        </p>
        {domain.status === "authenticated" && domain.location ? (
          <p>
            <Link className="underline" href="/documents">
              Документы
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
