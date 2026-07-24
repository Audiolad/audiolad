import type { ReactNode } from "react";

import BottomNav from "@/components/BottomNav";
import BecomeAuthorScrollReset from "@/components/become-author/BecomeAuthorScrollReset";
import { platformMobileShellClass } from "@/lib/navigation/bottom-nav";

export const becomeAuthorShellClassName = [
  "mx-auto min-h-screen w-full max-w-[430px] bg-platform-surface lg:max-w-[1024px]",
  platformMobileShellClass,
].join(" ");

export const becomeAuthorPaddingClassName = "px-5 pt-5 pb-8 lg:px-8 lg:pt-8";

type BecomeAuthorShellProps = {
  children: ReactNode;
};

export default function BecomeAuthorShell({ children }: BecomeAuthorShellProps) {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <BecomeAuthorScrollReset />
      <div className={becomeAuthorShellClassName}>
        <div className={becomeAuthorPaddingClassName}>{children}</div>
        <BottomNav />
      </div>
    </main>
  );
}
