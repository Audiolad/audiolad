import type { ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import BusinessAppShell from "@/components/business-app/BusinessAppShell";
import "@/components/business-app/business-app.css";
import {
  getHostnameFromHeaders,
  isBusinessHostname,
} from "@/lib/business-app/host";
import { buildBusinessAppMetadata } from "@/lib/business-app/seo";

export const metadata: Metadata = buildBusinessAppMetadata();

export default async function BusinessAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const hostname = getHostnameFromHeaders(await headers());

  // Defense in depth: proxy already 404s /business-app on non-business hosts.
  if (!isBusinessHostname(hostname)) {
    notFound();
  }

  return (
    <div className="business-app-root">
      <BusinessAppShell>{children}</BusinessAppShell>
    </div>
  );
}
