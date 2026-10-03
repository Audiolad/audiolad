import ClassicaTeamForm from "@/components/classica/ClassicaTeamForm";
import { requireClassicaAdmin } from "@/lib/classica/production/access";
import { revokeClassicaRoleAction } from "@/lib/classica/production/actions";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  classica_operator: "Оператор",
  classica_moderator: "Модератор",
};

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ClassicaTeamPage({ searchParams }: PageProps) {
  const session = await requireClassicaAdmin();
  const query = await searchParams;
  const holders = await session.supabase.rpc("classica_production_role_holders");
  const rows = (holders.data ?? []) as Array<{ user_id: string; label: string; role_code: string }>;

  return (
    <section className="grid max-w-2xl gap-4">
      <h2 className="text-xl font-semibold">Роли производства</h2>
      <p className="text-sm text-[#796ba0]">
        Администратор платформы уже может брать работу, проверять и публиковать. Отдельные роли нужны следующим операторам и модераторам.
      </p>
      {query.error ? <p className="text-sm text-[#9b2c4a]">{query.error}</p> : null}
      <ClassicaTeamForm />
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={`${row.user_id}-${row.role_code}`} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
            <span>
              {row.label} · {ROLE_LABELS[row.role_code] ?? row.role_code}
            </span>
            <form action={revokeClassicaRoleAction}>
              <input type="hidden" name="user_id" value={row.user_id} />
              <input type="hidden" name="role" value={row.role_code} />
              <button type="submit" className="text-[#9b2c4a]">
                Снять
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
