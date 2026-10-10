import { PracticeBackLink } from "@/components/products/practice-page/PracticePageParts";
import BrowserBackButton from "./BrowserBackButton";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="px-3 py-4">
      <PracticeBackLink />
      <BrowserBackButton />
      <h1 data-testid="product-title">Продукт {id}</h1>
      <div style={{ height: 2500 }}>Длинная страница продукта</div>
    </main>
  );
}
