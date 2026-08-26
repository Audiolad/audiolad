import type { ReactNode } from "react";

export default function MeditationSolutionsLandingLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div
      data-meditation-solutions-shell
      className="min-h-dvh bg-[#f7f2fc] text-[#25135c]"
    >
      {children}
    </div>
  );
}
