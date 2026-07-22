import AdminUsersTable from "@/components/admin/AdminUsersTable";
import TestUserResetPanel from "@/components/admin/TestUserResetPanel";
import { requireAdminPanelAccess } from "@/lib/admin/guard";
import { getPlatformOwnerSessionIfOwner } from "@/lib/admin/require-platform-owner";
import { getTestUserResetPreflight } from "@/lib/admin/test-user-reset/reset";
import { listAdminUsers } from "@/lib/admin/queries";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const session = await requireAdminPanelAccess();
  const ownerSession = await getPlatformOwnerSessionIfOwner();
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);

  let data;
  let testResetPreflight = null;

  try {
    const tasks: [
      ReturnType<typeof listAdminUsers>,
      ReturnType<typeof getTestUserResetPreflight> | Promise<null>,
    ] = [
      listAdminUsers({
        page: Number.isFinite(page) ? page : 1,
        query: params.q,
        roleFilter: params.role,
        actorUserId: session.userId,
      }),
      ownerSession
        ? getTestUserResetPreflight(createServiceRoleClient(), {
            actorUserId: ownerSession.userId,
          })
        : Promise.resolve(null),
    ];

    const [usersData, preflightData] = await Promise.all(tasks);
    data = usersData;
    testResetPreflight = preflightData;
  } catch (error) {
    console.error("admin_users_page_error", error);

    return (
      <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
        Не удалось загрузить пользователей. Попробуйте обновить страницу.
      </div>
    );
  }

  return (
    <section aria-labelledby="admin-users-heading">
      <h2 id="admin-users-heading" className="text-[21px] font-semibold">
        Пользователи
      </h2>
      <p className="mt-1 text-sm text-[#796ba0]">
        Всего: {data.total.toLocaleString("ru-RU")}
      </p>

      <div className="mt-5">
        <AdminUsersTable data={data} />
      </div>

      {ownerSession && testResetPreflight ? (
        <TestUserResetPanel initialPreflight={testResetPreflight} />
      ) : null}
    </section>
  );
}
