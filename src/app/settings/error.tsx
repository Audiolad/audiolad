"use client";

import BottomNav from "@/components/BottomNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";
import Link from "next/link";

type SettingsErrorProps = {
  reset: () => void;
};

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SettingsError({ reset }: SettingsErrorProps) {
  return (
    <main className="min-h-dvh bg-[#f7f2fc] text-[#25135c]">
      <div
        className={`mx-auto min-h-dvh w-full max-w-[480px] bg-[#f7f2fc] ${platformMobileShellClass}`}
      >
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

          <div className="flex min-h-[50vh] flex-col items-center justify-center py-10 text-center">
            <p className="mt-6 text-sm leading-6 text-[#796ba0]">
              Не удалось загрузить настройки.
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
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
