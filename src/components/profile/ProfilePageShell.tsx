import type { ReactNode } from "react";

import {
  profilePageGridClassName,
  profilePagePaddingClassName,
} from "@/lib/profile/layout";

type ProfilePageShellProps = {
  children: ReactNode;
};

export default function ProfilePageShell({ children }: ProfilePageShellProps) {
  return (
    <div className={profilePagePaddingClassName}>
      <div className={profilePageGridClassName}>{children}</div>
    </div>
  );
}
