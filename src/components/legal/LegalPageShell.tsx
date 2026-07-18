import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import BottomNav from "@/components/BottomNav";
import LegalLinksNav from "@/components/legal/LegalLinksNav";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

type LegalPageShellProps = {
  children: React.ReactNode;
};

export default function LegalPageShell({ children }: LegalPageShellProps) {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div
        className={`legal-page-shell mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface lg:max-w-[820px] ${platformMobileShellClass}`}
      >
        <div className="px-5 pb-8 pt-6 lg:px-12 lg:pt-10">
          <header className="border-b border-[#eadff8] pb-5">
            <AudioladHorizontalLogo priority />
          </header>

          {children}

          <LegalLinksNav className="mt-10 border-t border-[#eadff8] pt-6" />
        </div>

        <div className="xl:hidden">
          <BottomNav />
        </div>
      </div>
    </main>
  );
}
