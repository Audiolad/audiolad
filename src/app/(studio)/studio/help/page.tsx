import type { Metadata } from "next";

import { StudioHelpClient } from "@/components/studio/StudioHelpClient";
import { requireStudioEditorAccess } from "@/lib/studio/guest-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Инструкция для авторов — Студия АудиоЛад",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioHelpPage() {
  await requireStudioEditorAccess("/studio/help");
  return <StudioHelpClient />;
}
