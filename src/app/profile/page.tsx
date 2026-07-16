import ProfileContinueSection from "@/components/profile/ProfileContinueSection";
import ProfilePageHeader from "@/components/profile/ProfilePageHeader";
import ProfilePageShell from "@/components/profile/ProfilePageShell";
import {
  ProfileAccountSection,
  ProfileAdminPanelSection,
  ProfileAuthorBlock,
  ProfileCounters,
  ProfileQuickLinks,
  ProfileSignOutSection,
  ProfileUserCard,
} from "@/components/profile/ProfileSections";
import { signOut } from "@/app/auth/sign-out/actions";
import { profilePageFullWidthClassName } from "@/lib/profile/layout";
import { getProfilePageData } from "@/lib/profile/queries";
import { createClient } from "@/lib/supabase/server";
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
    <ProfilePageShell>
      <ProfilePageHeader />

      {isUpdated ? (
        <div
          className={`mt-6 rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-4 text-sm leading-6 text-[#3d8d65] ${profilePageFullWidthClassName}`}
        >
          Профиль успешно обновлён.
        </div>
      ) : null}

      <ProfileUserCard card={profileData.card} />
      <ProfileContinueSection state={profileData.continueState} />
      <ProfileCounters counters={profileData.counters} />
      <ProfileQuickLinks />
      <ProfileAuthorBlock section={profileData.authorSection} />
      {profileData.showAdminPanel ? <ProfileAdminPanelSection /> : null}
      <ProfileAccountSection />
      <ProfileSignOutSection signOutAction={signOut} />
    </ProfilePageShell>
  );
}
