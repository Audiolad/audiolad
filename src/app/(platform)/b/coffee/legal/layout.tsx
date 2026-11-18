import type { ReactNode } from "react";

import "@/components/business/legal/business-legal.css";

export default function BusinessLegalLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
