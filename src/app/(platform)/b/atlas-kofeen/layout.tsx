import type { ReactNode } from "react";
import { Playfair_Display } from "next/font/google";

import "@/components/business/coffee-atlas/coffee-atlas.css";

const atlasSerif = Playfair_Display({
  subsets: ["cyrillic", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-atlas-serif",
});

export default function CoffeeAtlasLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <div className={atlasSerif.variable}>{children}</div>;
}
