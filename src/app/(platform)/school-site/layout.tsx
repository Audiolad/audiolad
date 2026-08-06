import type { ReactNode } from "react";
import { Playfair_Display } from "next/font/google";

import "@/components/school/school-landing.css";

const schoolSerif = Playfair_Display({
  subsets: ["cyrillic", "latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-school-serif",
});

export default function SchoolSiteLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className={`school-site-root ${schoolSerif.variable}`}>{children}</div>
  );
}
