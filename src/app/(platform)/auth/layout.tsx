import type { Metadata } from "next";
import { headers } from "next/headers";

import { AuthHostnameProvider } from "@/components/auth/AuthPresentation";
import { getHostnameFromHeaders } from "@/lib/business-app/host";
import "@/components/business-app/theme/business-theme.css";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hostname = getHostnameFromHeaders(await headers());
  return <AuthHostnameProvider hostname={hostname}>{children}</AuthHostnameProvider>;
}
