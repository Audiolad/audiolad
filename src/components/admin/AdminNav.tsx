"use client";

import { usePathname } from "next/navigation";

import AdminNavTabs, { type AdminNavLink } from "@/components/admin/AdminNavTabs";

export type { AdminNavLink };

type AdminNavProps = {
  items: AdminNavLink[];
};

export default function AdminNav({ items }: AdminNavProps) {
  const pathname = usePathname();

  return <AdminNavTabs items={items} pathname={pathname} />;
}
