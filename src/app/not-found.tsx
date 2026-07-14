import Link from "next/link";

export default function NotFound() {
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
        href="/catalog"
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
