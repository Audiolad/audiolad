import Link from "next/link";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  return (
    <main className="px-3 py-4">
      <h1 data-testid="home-title">Главная</h1>
      <Link href="/catalog" data-testid="tab-catalog">Каталог</Link>
      {to ? (
        <Link href={to} data-testid="home-to-product" className="ml-4">
          Тот же продукт
        </Link>
      ) : null}
    </main>
  );
}
