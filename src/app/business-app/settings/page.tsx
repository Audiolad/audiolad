import type { Metadata } from "next";

import BusinessPlayerSettings from "@/components/business-app/BusinessPlayerSettings";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";

export const metadata: Metadata = {
  ...buildBusinessAppMetadata(),
  title: "Настройка – АудиоЛад Бизнес",
  robots: { index: false, follow: false },
};

/** Sound and player choices that already have device storage. */
export default function BusinessAppSettingsPage() {
  return (
    <div className="business-app-span-full mx-auto max-w-3xl space-y-4" data-testid="biz-player-settings">
      <header>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)]">Настройка</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--biz-text-muted)]">Звучание плеера в этом кабинете.</p>
      </header>
      <BusinessPlayerSettings />
    </div>
  );
}
