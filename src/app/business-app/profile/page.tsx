import BusinessLoginAccess from "@/components/business-app/profile/BusinessLoginAccess";
import { businessPasswordState } from "@/lib/business-app/login-access";
import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";

import { getHostnameFromHeaders } from "@/lib/business-app/host";
import { businessAuthHref } from "@/lib/access-grants/paths";

import { signOut } from "@/app/(platform)/auth/sign-out/actions";
import SignOutForm from "@/components/auth/SignOutForm";
import ProfileHelpContact from "@/components/business-app/ProfileHelpContact";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { buildNamedBusinessPageMetadata } from "@/lib/business-app/seo";
import BusinessProfileForm from "@/components/business-app/profile/BusinessProfileForm";
import BusinessOwnerSurnamePrompt from "@/components/business-app/BusinessOwnerSurnamePrompt";
import BusinessTimezoneForm from "@/components/business-app/profile/BusinessTimezoneForm";
import BusinessReceiptEmailForm from "@/components/business-app/profile/BusinessReceiptEmailForm";
import BusinessProfileSubscription from "@/components/business-app/profile/BusinessProfileSubscription";
import { businessKindLabel, businessTimezoneLabel } from "@/lib/business-app/profile";
import { extractBusinessFirstName, extractBusinessLastName } from "@/lib/business-app/domain-identity";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessCabinetPermission } from "@/lib/business-app/cabinet-mode.server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildNamedBusinessPageMetadata(getHostnameFromHeaders(await headers()), "Профиль");
}

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
  const ownerSurname = extractBusinessLastName({ metadataLastName: meta.last_name });
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
        <>
        {ownerSurname.trim() ? null : (
          <div className="mb-4">
            <BusinessOwnerSurnamePrompt />
          </div>
        )}
        {user && domain.status === "authenticated" && domain.canPay ? (
          <BusinessLoginAccess email={email} anonymous={user.is_anonymous === true} savedEmail={domain.savedReceiptEmail ?? null} passwordState={businessPasswordState(user)} />
        ) : null}
        <section className="business-app-card space-y-3">
          <BusinessProfileForm ownerName={ownerName} ownerSurname={ownerSurname} organizationName={domain.organizationId ? (domain.organizationName ?? "") : null} canEditOrganization={membership?.role === "owner"} />
          <dl className="space-y-2 text-sm">
            {email ? (
              <div>
                <dt className="text-[var(--biz-text-muted)]">Почта</dt>
                <dd className="font-semibold text-[var(--biz-text)]">{email}</dd>
                {domain.status === "authenticated" && domain.canPay ? (
                  <dd className="text-[var(--biz-text-muted)]" data-testid="biz-profile-receipt-email-account">
                    Сюда же приходят чеки об оплате.
                  </dd>
                ) : null}
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
                {domain.location.timezone && membership?.role !== "owner" ? (
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
          {domain.location && membership?.role === "owner" ? (
            <BusinessTimezoneForm timezone={domain.location.timezone || "Europe/Moscow"}
              currentLabel={businessTimezoneLabel(domain.location.timezone || "Europe/Moscow")} />
          ) : null}
          {/* t1442u: an anonymous owner saves this address in «Вход в кабинет» above. */}
          {domain.status === "authenticated" && domain.needsReceiptEmail && user?.is_anonymous !== true ? (
            <BusinessReceiptEmailForm receiptEmail={domain.savedReceiptEmail ?? null} />
          ) : null}
          {domain.location ? null : (
            <p>
              <Link className="business-app-btn business-app-btn-primary business-app-focus-ring" href="/onboarding">
                Подключить кофейню
              </Link>
            </p>
          )}
          <BusinessProfileSubscription offerAccepted={domain.offerAccepted} timezone={domain.location?.timezone || "Europe/Moscow"} nowIso={new Date().toISOString()}
            showPaymentHistory={membership?.role === "owner"} />
          {/* t1352u: «Выйти» in the bottom-right corner of this card, away from «История оплат». */}
          <div className="flex justify-end pt-3" data-testid="biz-profile-sign-out">
            <SignOutForm action={signOut} anonymousWarning={user?.is_anonymous === true} saveAccessHref="/profile#biz-profile-login">
              <button type="submit" className="business-app-btn business-app-btn-secondary business-app-focus-ring">
                Выйти
              </button>
            </SignOutForm>
          </div>
        </section>
        </>
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
