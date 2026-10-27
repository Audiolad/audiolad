import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "@/app/(platform)/auth/sign-out/actions";
import SignOutForm from "@/components/auth/SignOutForm";
import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildBusinessAppMetadata(),
  title: "Профиль – АудиоЛад Бизнес",
  robots: { index: false, follow: false },
};

export default async function BusinessProfilePage() {
  const domain = await loadBusinessOwnerHomeContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.trim() || null;

  return (
    <div className="business-app-span-full mx-auto max-w-3xl space-y-4" data-testid="biz-profile">
      <header>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)]">Профиль</h1>
      </header>

      {domain.status === "anonymous" ? (
        <section className="business-app-card space-y-3">
          <p>Войдите в аккаунт, чтобы видеть точку и документы.</p>
          <div className="flex flex-wrap gap-2">
            <a className="business-app-btn business-app-btn-primary business-app-focus-ring" href="https://audiolad.ru/auth/sign-in">
              Войти
            </a>
            <a className="business-app-btn business-app-btn-secondary business-app-focus-ring" href="https://audiolad.ru/auth/sign-up">
              Регистрация
            </a>
          </div>
        </section>
      ) : (
        <section className="business-app-card space-y-3">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-[var(--biz-text-muted)]">Имя</dt>
              <dd className="font-semibold text-[var(--biz-text)]">{domain.owner.firstName}</dd>
            </div>
            {email ? (
              <div>
                <dt className="text-[var(--biz-text-muted)]">Почта</dt>
                <dd className="font-semibold text-[var(--biz-text)]">{email}</dd>
              </div>
            ) : null}
            {domain.organizationName ? (
              <div>
                <dt className="text-[var(--biz-text-muted)]">Организация</dt>
                <dd className="font-semibold text-[var(--biz-text)]">{domain.organizationName}</dd>
              </div>
            ) : null}
            {domain.location ? (
              <>
                <div>
                  <dt className="text-[var(--biz-text-muted)]">Точка</dt>
                  <dd className="font-semibold text-[var(--biz-text)]">{domain.location.name}</dd>
                </div>
                {domain.location.businessCategory ? (
                  <div>
                    <dt className="text-[var(--biz-text-muted)]">Направление</dt>
                    <dd className="font-semibold text-[var(--biz-text)]">{domain.location.businessCategory}</dd>
                  </div>
                ) : null}
                {domain.location.timezone ? (
                  <div>
                    <dt className="text-[var(--biz-text-muted)]">Часовой пояс</dt>
                    <dd className="font-semibold text-[var(--biz-text)]">{domain.location.timezone}</dd>
                  </div>
                ) : null}
              </>
            ) : (
              <div>
                <dt className="text-[var(--biz-text-muted)]">Точка</dt>
                <dd className="font-semibold text-[var(--biz-text)]">Точка ещё не подключена.</dd>
              </div>
            )}
          </dl>
          {domain.location ? null : (
            <p>
              <Link className="business-app-btn business-app-btn-primary business-app-focus-ring" href="/onboarding">
                Подключить точку
              </Link>
            </p>
          )}
          <SignOutForm action={signOut}>
            <button type="submit" className="business-app-btn business-app-btn-secondary business-app-focus-ring">
              Выйти
            </button>
          </SignOutForm>
        </section>
      )}

      <section className="business-app-card space-y-2">
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
