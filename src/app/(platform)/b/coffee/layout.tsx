import type { ReactNode } from "react";
import { Playfair_Display } from "next/font/google";

import "@/components/business/vertical-guides/guide.css";

const guideSerif = Playfair_Display({
  subsets: ["cyrillic", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-guide-serif",
});

export default function CoffeeGuideLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <div className={guideSerif.variable}>{children}</div>;
}
