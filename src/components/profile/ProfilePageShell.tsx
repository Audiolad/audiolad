import type { ReactNode } from "react";

import BottomNav from "@/components/BottomNav";
import {
  profilePageGridClassName,
  profilePagePaddingClassName,
  profilePageShellClassName,
} from "@/lib/profile/layout";

type ProfilePageShellProps = {
  children: ReactNode;
};

export default function ProfilePageShell({ children }: ProfilePageShellProps) {
  return (
    <main className="min-h-screen bg-platform-surface text-[#25135c]">
      <div className={profilePageShellClassName}>
        <div className={profilePagePaddingClassName}>
          <div className={profilePageGridClassName}>{children}</div>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
