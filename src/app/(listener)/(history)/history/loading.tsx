function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-[22px] bg-[#eadff8]/70 ${className}`} />
  );
}

export default function HistoryLoading() {
  return (
    <>
      <div className="hidden xl:block">
        <SkeletonBlock className="h-8 w-32" />
        <SkeletonBlock className="mt-2 h-4 w-72" />
      </div>

      <div className="mt-7 flex gap-2">
        <SkeletonBlock className="h-11 w-16 rounded-full" />
        <SkeletonBlock className="h-11 w-28 rounded-full" />
        <SkeletonBlock className="h-11 w-32 rounded-full" />
      </div>

      <div className="mt-7 space-y-4 xl:space-y-5">
        <SkeletonBlock className="h-[220px] xl:h-[176px]" />
        <SkeletonBlock className="h-[220px] xl:h-[176px]" />
        <SkeletonBlock className="h-[220px] xl:h-[176px]" />
      </div>
    </>
  );
}
