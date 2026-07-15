import BottomNav from "@/components/BottomNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

type LegalPageShellProps = {
  children: React.ReactNode;
};

export default function LegalPageShell({ children }: LegalPageShellProps) {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface lg:max-w-[820px] ${platformMobileShellClass}`}
      >
        {children}
        <BottomNav />
      </div>
    </main>
  );
}
