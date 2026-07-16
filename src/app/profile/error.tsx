"use client";

import BottomNav from "@/components/BottomNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

type ProfileErrorProps = {
  reset: () => void;
};

export default function ProfileError({ reset }: ProfileErrorProps) {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 pt-6 text-center">
          <h1 className="text-[28px] font-semibold">Профиль</h1>

          <p className="mt-6 text-sm leading-6 text-[#796ba0]">
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

        <BottomNav />
      </div>
    </main>
  );
}
