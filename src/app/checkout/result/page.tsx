import type { Metadata } from "next";
import { Suspense } from "react";

import LegalFooter from "@/components/LegalFooter";
import PrimaryNav from "@/components/PrimaryNav";
import CheckoutResultClient from "@/app/checkout/result/CheckoutResultClient";

export const metadata: Metadata = {
  title: "Результат оплаты – АудиоЛад",
  description: "Проверка статуса оплаты и открытие доступа к аудиолекции.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CheckoutResultPage() {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface pb-10 lg:max-w-[1180px]">
        <div className="px-5 pb-8 pt-6 lg:px-12 lg:pt-8">
          <header className="border-b border-[#eadff8] pb-5">
            <h1 className="text-[28px] font-semibold leading-none text-[#6234b5] lg:text-[26px]">
              АудиоЛад
            </h1>
            <div className="mt-5 hidden lg:block">
              <PrimaryNav className="flex items-center gap-8" />
            </div>
          </header>

          <div className="mx-auto mt-10 max-w-[560px]">
            <Suspense
              fallback={
                <div className="rounded-[24px] border border-[#eadff8] bg-white px-6 py-8 text-center">
                  <p className="text-[15px] text-[#6f61a3]">Загружаем статус оплаты…</p>
                </div>
              }
            >
              <CheckoutResultClient />
            </Suspense>
          </div>

          <LegalFooter className="mt-12" />
        </div>
      </div>
    </main>
  );
}
