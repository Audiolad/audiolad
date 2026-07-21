import ProfilePageShell from "@/components/profile/ProfilePageShell";

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-[22px] bg-[#eadff8]/70 ${className}`} />
  );
}

export default function ProfileLoading() {
  return (
    <ProfilePageShell>
      <header className="col-span-full flex items-center justify-between">
        <SkeletonBlock className="h-12 w-12 rounded-full" />
        <SkeletonBlock className="h-8 w-28" />
        <SkeletonBlock className="h-11 w-11 rounded-full" />
      </header>

      <SkeletonBlock className="mt-6 h-[180px] min-w-0 xl:h-[196px]" />

      <SkeletonBlock className="mt-6 h-[220px] min-w-0 xl:mt-6 xl:h-[260px] xl:self-start" />

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
    </ProfilePageShell>
  );
}
