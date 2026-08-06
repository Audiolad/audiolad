import type { ReactNode } from "react";

export default function PracticeListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="listener-practice-content px-5 pb-6 pt-0 lg:px-10 xl:px-0 xl:pb-8 xl:pt-0">
      {children}
    </div>
  );
}
