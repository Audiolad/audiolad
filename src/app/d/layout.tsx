import type { Metadata } from "next";

import {
  buildPersonalMaterialGuestMetadata,
  personalMaterialGuestPrivacyHeaders,
} from "@/lib/personal-materials/guest/privacy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPersonalMaterialGuestMetadata();

export default function PersonalMaterialGuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

export function headers() {
  return personalMaterialGuestPrivacyHeaders;
}
