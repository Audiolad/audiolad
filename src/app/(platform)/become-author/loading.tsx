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
          <div className="min-w-0 space-y-6">
            <SkeletonBlock className="h-[180px]" />
            <SkeletonBlock className="h-12 w-full lg:w-56" />
            <SkeletonBlock className="h-[220px]" />
            <SkeletonBlock className="h-[220px]" />
          </div>
          <SkeletonBlock className="mt-8 h-[420px] lg:mt-0" />
          <SkeletonBlock className="mt-8 h-[160px] lg:col-span-2" />
        </div>
    </BecomeAuthorShell>
  );
}
