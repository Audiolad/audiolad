"use client";

import ProfilePageHeader from "@/components/profile/ProfilePageHeader";
import ProfilePageShell from "@/components/profile/ProfilePageShell";
import { profilePageFullWidthClassName } from "@/lib/profile/layout";

type ProfileErrorProps = {
  reset: () => void;
};

export default function ProfileError({ reset }: ProfileErrorProps) {
  return (
    <ProfilePageShell>
      <ProfilePageHeader />

      <div
        className={`flex min-h-[50vh] flex-col items-center justify-center py-10 text-center lg:min-h-[40vh] ${profilePageFullWidthClassName}`}
      >
        <p className="mt-6 text-sm leading-6 text-[#796ba0] lg:max-w-md">
          Не удалось загрузить профиль.
          <br />
          Попробуйте обновить страницу.
        </p>

        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-11 rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Обновить страницу
        </button>
      </div>
    </ProfilePageShell>
  );
}
