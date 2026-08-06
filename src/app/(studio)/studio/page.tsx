import Link from "next/link";
import { redirect } from "next/navigation";

import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/studio");
  }

  const workspaces = await listAuthorWorkspacesForUser(user.id);

  if (workspaces.length === 0) {
    redirect("/author-dashboard");
  }

  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-3xl items-center justify-center px-5 py-8">
      <div className="w-full rounded-[28px] border border-[#e4d7f4] bg-white p-6 text-center sm:p-10">
        <p className="text-sm font-medium text-[#7042c5]">АудиоЛад для авторов</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
          Студия аудиопрактик
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#655685]">
          Рабочее пространство находится в разработке.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/author-dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Вернуться в кабинет автора
          </Link>
          <Link
            href="/profile"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c9ef] px-5 py-2.5 text-sm font-semibold text-[#7042c5]"
          >
            Вернуться в АудиоЛад
          </Link>
        </div>
      </div>
    </section>
  );
}
