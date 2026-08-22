import type { ReactNode } from "react";

export default function MaxSiteLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <div className="max-site-root">{children}</div>;
}
