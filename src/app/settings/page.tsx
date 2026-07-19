import BottomNav from "@/components/BottomNav";
import PwaSettingsSection from "@/components/pwa/PwaSettingsSection";
import AnalyticsPrivacySection from "@/components/settings/AnalyticsPrivacySection";
import UserAvatar from "@/components/profile/UserAvatar";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import { signOut } from "@/app/auth/sign-out/actions";
import { resolveProfileAvatarUrl } from "@/lib/profile/avatar";
import {
  getDisplayName,
  getInitial,
  getProfileRolePrimaryLabel,
} from "@/lib/profile/display-name";
import {
  PROFILE_LEGAL_LINKS,
  SETTINGS_LEGAL_SECTION_ID,
} from "@/lib/profile/constants";
import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, avatar_path, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const authorWorkspaces = await listAuthorWorkspacesForUser(user.id).catch(
    () => [],
  );

  const displayName = getDisplayName(profile, user);
  const initial = getInitial(displayName);
  const avatarUrl = await resolveProfileAvatarUrl(profile, user.id);
  const roleLabel = getProfileRolePrimaryLabel(authorWorkspaces.length);
  const emailDescription = user.email?.trim() || "Не указан";

  const accountItems = [
    {
      icon: "◎",
      title: "Личные данные",
      description: "Имя, фотография и контактная информация",
      href: "/profile/edit",
    },
    {
      icon: "✉",
      title: "Электронная почта",
      description: emailDescription,
      href: null,
    },
    {
      icon: "⌘",
      title: "Пароль и безопасность",
      description: "Восстановление пароля",
      href: "/auth/forgot-password",
    },
  ];

  const appItems = [
    {
      icon: "?",
      title: "Помощь и поддержка",
      description: "Ответы на вопросы и связь с нами",
    },
  ];

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}>
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <Link
              href="/profile"
              aria-label="Назад"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]"
            >
              <BackIcon />
            </Link>

            <div className="text-center">
              <h1 className="text-[26px] font-semibold">Настройки</h1>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Управление аккаунтом и приложением
              </p>
            </div>

            <div className="h-11 w-11" />
          </header>

          <section className="mt-7 rounded-[26px] bg-gradient-to-br from-[#7042c5] to-[#9a74d8] p-5 text-white shadow-[0_14px_34px_rgba(96,59,168,0.22)]">
            <p className="text-sm text-white/70">Ваш аккаунт</p>

            <div className="mt-3 flex items-center gap-4">
              <UserAvatar
                avatarUrl={avatarUrl}
                initial={initial}
                size={64}
                className="h-16 w-16 rounded-[20px] bg-white/15 text-2xl font-semibold text-white"
                initialClassName="text-2xl font-semibold text-white"
              />

              <div>
                <p className="text-xl font-semibold">{displayName}</p>
                <p className="mt-1 text-sm text-white/70">{roleLabel}</p>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-[20px] font-semibold">Аккаунт</h2>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
              {accountItems.map((item, index) =>
                item.href ? (
                  <Link
                    key={item.title}
                    href={item.href}
                    className={`flex w-full items-center justify-between gap-3 px-5 py-4 text-left ${
                      index !== accountItems.length - 1
                        ? "border-b border-[#eee6f7]"
                        : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f4ecfb] text-[#7042c5]">
                        {item.icon}
                      </span>

                      <span className="min-w-0">
                        <span className="block font-medium">{item.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#7d70a2]">
                          {item.description}
                        </span>
                      </span>
                    </span>

                    <span className="shrink-0 text-xl text-[#7042c5]">›</span>
                  </Link>
                ) : (
                  <div
                    key={item.title}
                    className={`flex w-full items-center justify-between gap-3 px-5 py-4 ${
                      index !== accountItems.length - 1
                        ? "border-b border-[#eee6f7]"
                        : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f4ecfb] text-[#7042c5]">
                        {item.icon}
                      </span>

                      <span className="min-w-0">
                        <span className="block font-medium">{item.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#7d70a2]">
                          {item.description}
                        </span>
                      </span>
                    </span>
                  </div>
                ),
              )}
            </div>
          </section>

          <PwaSettingsSection items={appItems} />

          <AnalyticsPrivacySection />

          <section
            id={SETTINGS_LEGAL_SECTION_ID}
            className="mt-8 scroll-mt-6"
            aria-labelledby="settings-legal-heading"
          >
            <h2 id="settings-legal-heading" className="text-[20px] font-semibold">
              Правовая информация
            </h2>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
              {PROFILE_LEGAL_LINKS.map((item, index) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-[56px] w-full items-center justify-between px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5] ${
                    index !== PROFILE_LEGAL_LINKS.length - 1
                      ? "border-b border-[#eee6f7]"
                      : ""
                  }`}
                >
                  <span className="text-[15px] leading-6 text-[#25135c]">
                    {item.title}
                  </span>
                  <span className="text-xl text-[#7042c5]" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <form action={signOut}>
              <button
                type="submit"
                className="w-full rounded-[20px] border border-[#efc7cf] bg-[#fff8f9] px-5 py-4 font-semibold text-[#b34f63]"
              >
                Выйти из аккаунта
              </button>
            </form>
          </section>

          <p className="mt-6 text-center text-xs text-[#a692b4]">
            АудиоЛад · Версия 1.0
          </p>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
