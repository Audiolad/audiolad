import Image from "next/image";
import BottomNav from "@/components/BottomNav";
import ProfileContinueSection from "@/components/profile/ProfileContinueSection";
import {
  ProfileAccountSection,
  ProfileAuthorBlock,
  ProfileCounters,
  ProfileQuickLinks,
  ProfileUserCard,
} from "@/components/profile/ProfileSections";
import { signOut } from "@/app/auth/sign-out/actions";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import { getProfilePageData } from "@/lib/profile/queries";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string }>;
}) {
  const params = await searchParams;
  const isUpdated = params.updated === "1";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const profileData = await getProfilePageData(supabase, user);

  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-6">
          <header className="flex items-center justify-between">
            <Image
              src="/audiolad-logo.png"
              alt="АудиоЛад"
              width={48}
              height={48}
              className="h-12 w-12 object-contain"
            />

            <h1 className="text-[28px] font-semibold">Профиль</h1>

            <Link
              href="/settings"
              aria-label="Настройки"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-2xl text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              ⚙
            </Link>
          </header>

          {isUpdated ? (
            <div className="mt-6 rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-4 text-sm leading-6 text-[#3d8d65]">
              Профиль успешно обновлён.
            </div>
          ) : null}

          <ProfileUserCard card={profileData.card} />

          <ProfileContinueSection state={profileData.continueState} />
          <ProfileCounters counters={profileData.counters} />
          <ProfileQuickLinks />
          <ProfileAuthorBlock section={profileData.authorSection} />
          <ProfileAccountSection />

          <section className="mt-8">
            <form action={signOut}>
              <button
                type="submit"
                className="min-h-11 w-full rounded-[20px] border border-[#efc7cf] bg-[#fff8f9] px-5 py-4 font-semibold text-[#b34f63] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b34f63]"
              >
                Выйти
              </button>
            </form>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
