import BottomNav from "@/components/BottomNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[22px] bg-[#eadff8]/70 ${className}`} />;
}

export default function ProfileLoading() {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface ${platformMobileShellClass}`}
      >
        <div className="px-5 pt-6">
          <header className="flex items-center justify-between">
            <SkeletonBlock className="h-12 w-12 rounded-full" />
            <SkeletonBlock className="h-8 w-28" />
            <SkeletonBlock className="h-11 w-11 rounded-full" />
          </header>

          <SkeletonBlock className="mt-6 h-[180px]" />

          <div className="mt-5 grid grid-cols-3 gap-3">
            <SkeletonBlock className="h-[72px]" />
            <SkeletonBlock className="h-[72px]" />
            <SkeletonBlock className="h-[72px]" />
          </div>

          <SkeletonBlock className="mt-6 h-[160px]" />

          <div className="mt-6 grid grid-cols-2 gap-3">
            <SkeletonBlock className="h-[94px]" />
            <SkeletonBlock className="h-[94px]" />
          </div>

          <SkeletonBlock className="mt-8 h-[120px]" />
          <SkeletonBlock className="mt-8 h-[112px]" />
          <SkeletonBlock className="mt-8 h-14" />
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
