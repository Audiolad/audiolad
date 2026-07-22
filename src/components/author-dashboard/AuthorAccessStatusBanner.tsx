"use client";

import type { AuthorAccessStatus } from "@/lib/authors/access";
import { getAuthorAccessBannerMessage } from "@/lib/authors/access";

type AuthorAccessStatusBannerProps = {
  accessStatus: AuthorAccessStatus;
};

export default function AuthorAccessStatusBanner({
  accessStatus,
}: AuthorAccessStatusBannerProps) {
  const message = getAuthorAccessBannerMessage(accessStatus);

  if (!message) {
    return null;
  }

  const isSuspended =
    accessStatus === "suspended" || accessStatus === "terminated";

  return (
    <div
      className={`mb-5 rounded-[20px] border px-4 py-3 text-sm leading-6 ${
        isSuspended
          ? "border-[#efc7cf] bg-[#fff8f9] text-[#9a3f55]"
          : "border-[#d9c9f3] bg-[#f7f1ff] text-[#4f3a78]"
      }`}
      role="status"
    >
      {message}
    </div>
  );
}
