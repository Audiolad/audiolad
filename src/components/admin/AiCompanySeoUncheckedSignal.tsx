import Link from "next/link";

import { SEO_UNCHECKED_ADMIN_HREF } from "@/lib/seo-queries/admin-filter";

export default function AiCompanySeoUncheckedSignal({ count }: { count: number | null | undefined }) {
  if (typeof count !== "number" || !Number.isFinite(count) || !Number.isInteger(count) || count <= 0) return null;

  return (
    <div
      role="status"
      data-seo-unchecked-signal="true"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"
    >
      <div className="min-w-0 flex-1 basis-64 break-words">
        <p className="font-semibold">{`Непроверенные SEO-запросы: ${count.toLocaleString("ru-RU")}`}</p>
        <p className="mt-1 text-sm">Авторы видят только проверенные запросы – проверьте, чтобы они не потерялись.</p>
      </div>
      <Link
        href={SEO_UNCHECKED_ADMIN_HREF}
        className="inline-flex min-h-11 max-w-full items-center justify-center rounded-xl bg-amber-900 px-4 py-2 text-center text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900"
      >
        Перейти и проверить
      </Link>
    </div>
  );
}
