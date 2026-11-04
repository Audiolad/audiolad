"use client";

import { useEffect } from "react";

import { clearCoffeeTestBrowserState } from "@/lib/admin/coffee-test-reset/clear-browser";

export default function CoffeeTestResetCleaner({ armed }: { armed: boolean }) {
  useEffect(() => {
    if (!armed) return;
    // After every mount effect of the shell, so nothing re-writes storage behind us.
    const timer = window.setTimeout(() => {
      try { clearCoffeeTestBrowserState(); } catch { /* blocked storage: the server part is done */ }
      window.location.replace("/");
    }, 50);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <main className="mx-auto max-w-[480px] px-5 py-16 text-center">
      <h1 className="text-[22px] font-semibold">
        {armed ? "Начинаем с нуля…" : "Сбрасывать нечего"}
      </h1>
      <p className="mt-3 text-sm opacity-80">
        {armed
          ? "Очищаем данные кофейни на этом устройстве и открываем первый визит."
          : "Эта страница работает только сразу после сброса тестового аккаунта."}
      </p>
      {/* A full page load on purpose: the first visit must start without client state. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white">
        Открыть кофейню
      </a>
    </main>
  );
}
