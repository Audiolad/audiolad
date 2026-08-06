import type { ReactNode } from "react";

export default function StudioRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-platform-surface text-[#25135c]">
      {children}
    </main>
  );
}
