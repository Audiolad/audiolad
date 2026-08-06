import type { Metadata } from "next";

import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

export default function PersonalMaterialClaimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
