import type { Metadata } from "next";
import type { ReactNode } from "react";

import AdminShell from "@/components/admin/AdminShell";
import { requireMusicLabPageAccess, resolveMusicLabAccess } from "@/lib/music-lab/guard";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo/private-robots";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { decision } = await resolveMusicLabAccess();
  return {
    title: decision === "allow" ? "Музыкальная лаборатория" : "АудиоЛад",
    robots: PRIVATE_PAGE_ROBOTS,
  };
}

export default async function MusicAnalyzerLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireMusicLabPageAccess();

  return (
    <AdminShell
      title="Музыкальная лаборатория"
      subtitle="Human Listening Validation v0.5"
      backHref="/profile"
      backLabel="Назад в профиль"
    >
      {children}
    </AdminShell>
  );
}
