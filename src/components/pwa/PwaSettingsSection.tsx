"use client";

import PwaSettingsMenuItem from "@/components/pwa/PwaSettingsMenuItem";
import { usePwaInstall } from "@/components/pwa/PwaInstallProvider";

type SettingsApplicationSectionProps = {
  items: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
};

export default function SettingsApplicationSection({
  items,
}: SettingsApplicationSectionProps) {
  const { isStandalone } = usePwaInstall();

  return (
    <section className="mt-8">
      <h2 className="text-[20px] font-semibold">Приложение</h2>

      <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
        {!isStandalone ? (
          <div className="border-b border-[#eee6f7]">
            <PwaSettingsMenuItem variant="settings" />
          </div>
        ) : null}

        {items.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={`flex w-full items-center justify-between gap-3 px-5 py-4 text-left ${
              index !== items.length - 1 ? "border-b border-[#eee6f7]" : ""
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
          </button>
        ))}
      </div>
    </section>
  );
}
