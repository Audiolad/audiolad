import BecomeAuthorShell from "@/components/become-author/BecomeAuthorShell";

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-[22px] bg-[#eadff8]/70 ${className}`} />
  );
}

export default function BecomeAuthorLoading() {
  return (
    <BecomeAuthorShell>
      <header className="flex items-center justify-between">
          <SkeletonBlock className="h-11 w-11 rounded-full" />
          <SkeletonBlock className="h-10 w-40" />
          <SkeletonBlock className="h-11 w-11 rounded-full" />
        </header>

        <div className="mt-6 flex flex-col lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] lg:gap-8">
          <SkeletonBlock className="order-1 h-[180px] lg:col-start-1 lg:row-start-1" />
          <SkeletonBlock className="order-2 mt-8 h-[280px] lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mt-0" />
          <div className="order-3 mt-8 space-y-6 lg:col-start-1 lg:row-start-2 lg:mt-0">
            <SkeletonBlock className="h-[220px]" />
            <SkeletonBlock className="h-[220px]" />
          </div>
        </div>
    </BecomeAuthorShell>
  );
}
