import BottomNav from "@/components/BottomNav";
import {
  profilePageGridClassName,
  profilePagePaddingClassName,
  profilePageShellClassName,
} from "@/lib/profile/layout";

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-[22px] bg-[#eadff8]/70 ${className}`} />
  );
}

export default function ProfileLoading() {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className={profilePageShellClassName}>
        <div className={profilePagePaddingClassName}>
          <div className={profilePageGridClassName}>
            <header className="col-span-full flex items-center justify-between">
              <SkeletonBlock className="h-12 w-12 rounded-full" />
              <SkeletonBlock className="h-8 w-28" />
              <SkeletonBlock className="h-11 w-11 rounded-full" />
            </header>

            <SkeletonBlock className="mt-6 h-[180px] min-w-0 lg:h-[196px]" />

            <SkeletonBlock className="mt-6 h-[220px] min-w-0 lg:mt-6 lg:h-[260px] lg:self-start" />

            <div className="mt-5 grid min-w-0 grid-cols-3 gap-3">
              <SkeletonBlock className="h-[72px]" />
              <SkeletonBlock className="h-[72px]" />
              <SkeletonBlock className="h-[72px]" />
            </div>

            <div className="mt-6 grid min-w-0 grid-cols-2 gap-3">
              <SkeletonBlock className="h-[94px]" />
              <SkeletonBlock className="h-[94px]" />
              <SkeletonBlock className="col-span-2 h-[94px]" />
            </div>

            <SkeletonBlock className="mt-8 h-[120px] min-w-0" />
            <SkeletonBlock className="mt-8 h-[112px] min-w-0" />
            <SkeletonBlock className="mt-8 h-14 min-w-0" />
          </div>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
