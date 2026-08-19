import type { Metadata } from "next";
import Link from "next/link";

import { guestHandoffResultMessage } from "@/lib/studio/guest-handoff";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Переход в Студию — АудиоЛад",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioGuestHandoffResultPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b1019] p-6 text-center text-[#edf0f7]">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-[#131b28] p-6">
        <p role="alert" className="text-base font-semibold">
          {guestHandoffResultMessage(reason)}
        </p>
        <Link
          href="/studio/try"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530]"
        >
          Открыть Студию
        </Link>
      </section>
    </main>
  );
}
