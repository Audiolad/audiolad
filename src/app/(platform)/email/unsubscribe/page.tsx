import { confirmUnsubscribeAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Отписка от писем АудиоЛада",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const params = await searchParams;

  if (params.status === "ok" || params.status === "already") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-[#25135c]">
        <h1 className="text-2xl font-semibold">Отписка выполнена</h1>
        <p className="mt-3 text-sm leading-6">
          Информационные письма авторам больше не будут приходить на этот адрес. Повторный переход по ссылке ничего не меняет.
        </p>
      </main>
    );
  }

  if (!params.token || params.status === "invalid") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-[#25135c]">
        <h1 className="text-2xl font-semibold">Ссылка недействительна</h1>
        <p className="mt-3 text-sm leading-6">
          Проверьте письмо и откройте свежую ссылку отписки.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-[#25135c]">
      <h1 className="text-2xl font-semibold">Отписаться от информационных писем</h1>
      <p className="mt-3 text-sm leading-6">
        Служебные письма о кабинете автора эта отписка не отключает. Подтвердите, если не хотите получать информационные и промо-письма для авторов.
      </p>
      <form action={confirmUnsubscribeAction} className="mt-6">
        <input type="hidden" name="token" value={params.token} />
        <button type="submit" className="rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white">
          Отписаться
        </button>
      </form>
    </main>
  );
}
