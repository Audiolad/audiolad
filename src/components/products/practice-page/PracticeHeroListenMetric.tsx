import { PlayIcon } from "@/components/home/HomeIcons";
import { formatCatalogPublicMetricCount } from "@/lib/catalog/public-metrics";

type PracticeHeroListenMetricProps = {
  qualifiedListenCount: number;
};

export default function PracticeHeroListenMetric({
  qualifiedListenCount,
}: PracticeHeroListenMetricProps) {
  return (
    <p
      data-practice-hero-listen-metric=""
      className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 text-sm font-medium text-[#9485b4] sm:w-auto sm:justify-start"
    >
      <PlayIcon />
      <span className="tabular-nums">
        {formatCatalogPublicMetricCount(qualifiedListenCount)}
      </span>
    </p>
  );
}