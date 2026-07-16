import BottomNav from "@/components/BottomNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-[22px] bg-[#eadff8]/70 ${className}`} />
  );
}

export default function HistoryLoading() {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-5">
          <header className="flex items-center justify-between">
            <SkeletonBlock className="h-11 w-11 rounded-full" />
            <SkeletonBlock className="h-12 w-32" />
            <SkeletonBlock className="h-11 w-11 rounded-full opacity-0" />
          </header>

          <div className="mt-7 flex gap-2">
            <SkeletonBlock className="h-11 w-16 rounded-full" />
            <SkeletonBlock className="h-11 w-28 rounded-full" />
            <SkeletonBlock className="h-11 w-32 rounded-full" />
          </div>

          <div className="mt-7 space-y-4">
            <SkeletonBlock className="h-[220px]" />
            <SkeletonBlock className="h-[220px]" />
            <SkeletonBlock className="h-[220px]" />
          </div>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
