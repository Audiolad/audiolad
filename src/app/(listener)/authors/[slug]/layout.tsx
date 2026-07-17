import type { ReactNode } from "react";

export default function AuthorPublicLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
