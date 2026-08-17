import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveStudioActor } from "@/lib/studio/guest-access";
import {
  STUDIO_GUEST_TRY_START_PATH,
  decideGuestTryPageFlow,
} from "@/lib/studio/guest-policy";
import { listStudioProjectsForGuest } from "@/lib/studio/server/repository";

export const dynamic = "force-dynamic";

export default async function StudioTryPage({
  searchParams,
}: {
  searchParams: Promise<{ started?: string }>;
}) {
  const actor = await resolveStudioActor();
  const { started } = await searchParams;
  const flow = decideGuestTryPageFlow({
    actorKind: actor.kind,
    returnedFromStart: started === "1",
  });

  if (flow === "author_studio") {
    redirect("/studio/projects");
  }

  if (flow === "continue_guest" && actor.kind === "guest") {
    const projects = await listStudioProjectsForGuest(actor.session.id);
    if (projects.length === 0) {
      redirect("/studio/project/new?from=try");
    }
    redirect("/studio/projects?from=try");
  }

  if (flow === "bootstrap") {
    redirect(STUDIO_GUEST_TRY_START_PATH);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b1019] p-6 text-center text-[#edf0f7]">
      <section className="w-full max-w-md rounded-xl border border-white/10 bg-[#131b28] p-6">
        <p role="alert" className="text-base font-semibold">
          Не удалось открыть гостевую Студию.
        </p>
        <p className="mt-2 text-sm text-[#b7c1d1]">
          Попробуйте ещё раз. Регистрация не нужна.
        </p>
        <Link
          href={STUDIO_GUEST_TRY_START_PATH}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530]"
        >
          Попробовать бесплатно
        </Link>
      </section>
    </main>
  );
}
