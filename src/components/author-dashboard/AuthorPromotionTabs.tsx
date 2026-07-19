"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type PromotionTabKey = "pages" | "campaigns";

const TABS: Array<{ key: PromotionTabKey; label: string }> = [
  { key: "pages", label: "Промостраницы" },
  { key: "campaigns", label: "Рекламные кампании" },
];

export function parsePromotionTab(value: string | null): PromotionTabKey {
  if (value === "pages") {
    return "pages";
  }

  return "campaigns";
}

type AuthorPromotionTabsProps = {
  activeTab: PromotionTabKey;
};

export default function AuthorPromotionTabs({ activeTab }: AuthorPromotionTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleTabChange(nextTab: PromotionTabKey) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextTab === "campaigns") {
      params.delete("tab");
      params.delete("page");
    } else {
      params.set("tab", nextTab);
    }

    router.replace(`/author-dashboard/promotion?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabChange(tab.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-[#7042c5] text-white"
                : "border border-[#ddcfef] bg-white text-[#7042c5]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
