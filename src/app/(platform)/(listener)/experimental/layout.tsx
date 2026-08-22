import type { ReactNode } from "react";

export default function ExperimentalListenerLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="px-5 pb-10 pt-5 lg:px-10 xl:px-6 xl:pt-3 xl:pb-5">
      {children}
    </div>
  );
}
