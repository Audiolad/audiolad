"use client";

import type { AdminAnalyticsKpiCard } from "@/lib/admin/analytics-queries";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) {
    return <div className="h-8 w-16" aria-hidden />;
  }

  const max = Math.max(...values, 1);
  const width = 64;
  const height = 28;
  const d = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / max) * (height - 4) - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function deltaTone(direction: "up" | "down" | "flat" | "neutral" | undefined): string {
  if (direction === "up") return "text-[#2f7d4a]";
  if (direction === "down") return "text-[#b34f63]";
  return "text-[#796ba0]";
}

export default function AdminAnalyticsKpiStrip({
  items,
  onOpen,
}: {
  items: AdminAnalyticsKpiCard[];
  onOpen: (key: AdminAnalyticsKpiCard["key"]) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => {
        const tone = item.delta ? deltaTone(item.delta.direction) : "text-[#796ba0]";
        const sparkColor =
          item.delta?.direction === "down"
            ? "#b34f63"
            : item.delta?.direction === "up"
              ? "#2f7d4a"
              : "#7042c5";

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onOpen(item.key)}
            className="rounded-[18px] border border-[#eadff8] bg-white p-3 text-left shadow-sm transition hover:border-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            title={`${item.hint}\nТип: ${item.kindLabel}\nФормула: ${item.formula}`}
            aria-label={`${item.label}: ${item.value}. ${item.delta?.compactLabel ?? "без сравнения"}. Открыть детали.`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-[#796ba0]">{item.label}</p>
              <Sparkline values={item.sparkline} color={sparkColor} />
            </div>
            <p className="mt-1 text-2xl font-semibold text-[#25135c]">
              {item.value.toLocaleString("ru-RU")}
            </p>
            <p className={`mt-1 text-xs font-medium ${tone}`}>
              {item.delta?.compactLabel ?? "—"}
              <span className="sr-only">
                {item.delta
                  ? `, предыдущий период ${item.delta.previous.toLocaleString("ru-RU")}`
                  : ", сравнение недоступно"}
              </span>
            </p>
          </button>
        );
      })}
    </div>
  );
}
