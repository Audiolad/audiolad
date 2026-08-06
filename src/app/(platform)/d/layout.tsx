import type { Metadata } from "next";

import { buildPersonalMaterialGuestMetadata } from "@/lib/personal-materials/guest/privacy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPersonalMaterialGuestMetadata();

export default function PersonalMaterialGuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
