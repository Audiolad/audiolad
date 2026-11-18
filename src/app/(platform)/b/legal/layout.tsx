import type { ReactNode } from "react";
import { Playfair_Display } from "next/font/google";

import "@/components/business/legal/business-legal.css";

const legalSerif = Playfair_Display({
  subsets: ["cyrillic", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-legal-serif",
});

export default function BusinessLegalLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <div className={legalSerif.variable}>{children}</div>;
}
