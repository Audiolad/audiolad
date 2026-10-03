import Link from "next/link";

export default function ClassicaProductionForbidden() {
  return (
    <div className="rounded-2xl border border-[#efc7cf] bg-white p-6">
      <h2 className="text-xl font-semibold">Недостаточно прав</h2>
      <p className="mt-2 text-sm text-[#796ba0]">Эта часть производства доступна другой роли.</p>
      <Link className="mt-4 inline-block text-sm font-medium text-[#7042c5]" href="/classica/production">
        К очереди
      </Link>
    </div>
  );
}
