import Link from "next/link";
import { headers } from "next/headers";

import { getHostnameFromHeaders } from "@/lib/business-app/host";
import { resolveNotFoundCatalogHref } from "@/lib/business-app/not-found-link";

export default async function NotFound() {
  const catalogHref = resolveNotFoundCatalogHref(
    getHostnameFromHeaders(await headers()),
  );
  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px",
      textAlign: "center",
      color: "#2B155F",
      background: "#ffffff"
    }}>
      <h1 style={{ fontSize: "56px", marginBottom: "16px" }}>404</h1>
      <p style={{ fontSize: "24px", marginBottom: "32px" }}>
        Такой страницы пока нет
      </p>
      <Link
        href={catalogHref}
        style={{
          padding: "18px 28px",
          borderRadius: "999px",
          background: "#6D3FD1",
          color: "#ffffff",
          textDecoration: "none",
          fontSize: "20px",
          fontWeight: 700
        }}
      >
        Вернуться в каталог
      </Link>
    </main>
  );
}
