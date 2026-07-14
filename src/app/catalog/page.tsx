import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { platformNavPaddingClass } from "@/lib/navigation/bottom-nav";

export const dynamic = "force-dynamic";

type Practice = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
};

async function getPractices(): Promise<Practice[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) return [];

  const res = await fetch(
    `${supabaseUrl}/rest/v1/practices?select=id,title,slug,description,format,duration_minutes,price,is_free,status&status=eq.published&order=created_at.desc`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      cache: "no-store",
    },
  );

  if (!res.ok) return [];

  return res.json();
}

const categories = [
  ["Любовь и отношения", "♡"],
  ["Деньги и изобилие", "₽"],
  ["Спокойствие и сон", "☾"],
  ["Энергия и восстановление", "✦"],
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default async function CatalogPage() {
  const practices = await getPractices();

  return (
    <main className="min-h-screen bg-[#f7f2fc] text-[#25135c]">
      <div
        className={`mx-auto min-h-screen w-full max-w-[430px] bg-[#fffdfd] shadow-sm ${platformNavPaddingClass}`}
      >
        <div className="px-5 pt-6">
          <header className="flex items-center justify-between">
            <Link href="/" aria-label="Назад" className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-3xl text-[#7042c5]">
              ‹
            </Link>

            <h1 className="text-[28px] font-semibold">Каталог практик</h1>

            <button type="button" aria-label="Поиск" className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5]">
              <SearchIcon />
            </button>
          </header>

          <label className="mt-6 flex items-center gap-3 rounded-[22px] border border-[#ded1f1] bg-white px-4 py-3.5">
            <span className="text-[#7042c5]"><SearchIcon /></span>
            <input type="search" placeholder="Поиск практик, авторов и тем" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#9485b4]" />
          </label>

          <section className="mt-6">
            <h2 className="text-[22px] font-semibold">Категории</h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {categories.map(([title, icon]) => (
                <button key={title} type="button" className="min-h-[120px] rounded-[24px] bg-gradient-to-br from-[#f4ddf5] to-[#dcd9f7] p-4 text-left">
                  <span className="text-4xl text-[#7042c5]">{icon}</span>
                  <span className="mt-4 block text-[16px] font-semibold leading-5">{title}</span>
                  <span className="mt-2 block text-sm text-[#76679d]">Подборка практик</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-[22px] font-semibold">Практики из базы</h2>

            <div className="mt-4 space-y-3">
              {practices.map((practice) => (
                <Link
                  key={practice.id}
                  href={`/practice/${practice.slug}`}
                  className="block rounded-[24px] border border-[#e8def5] bg-white p-4 shadow-sm"
                >
                  <div className="flex gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#8d6ad8] to-[#f1c4d6] text-4xl text-white">
                      ✦
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-[17px] font-semibold leading-5">{practice.title}</h3>
                      <p className="mt-1 text-sm text-[#7042c5]">Сергей и Зоя</p>
                      <p className="mt-1 text-sm text-[#7d70a2]">
                        {practice.format} · {practice.duration_minutes} мин
                      </p>
                      <p className="mt-2 font-semibold text-[#7042c5]">
                        {practice.is_free ? "Бесплатно" : `${practice.price} ₽`}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}

              {practices.length === 0 && (
                <div className="rounded-[24px] border border-[#e8def5] bg-[#faf6ff] p-5 text-center text-sm text-[#7d70a2]">
                  Практики пока не загрузились из базы.
                </div>
              )}
            </div>
          </section>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}