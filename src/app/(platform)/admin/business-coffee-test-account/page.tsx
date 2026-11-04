import CoffeeTestAccountPanel from "@/components/admin/CoffeeTestAccountPanel";
import { COFFEE_TEST_ACCOUNT_HREF, parseCoffeeTestAccounts } from "@/lib/admin/coffee-test-reset/model";
import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/** «Тестовый аккаунт кофейни»: owner only; the list comes from the DB allowlist. */
export default async function AdminCoffeeTestAccountPage() {
  const session = await requirePlatformOwnerAccess(COFFEE_TEST_ACCOUNT_HREF);

  let accounts = null;
  try {
    const { data, error } = await createServiceRoleClient().rpc("business_test_accounts_for_owner", {
      p_actor: session.userId,
    });
    if (!error) accounts = parseCoffeeTestAccounts(data);
    else console.error("admin_coffee_test_account_list_failed");
  } catch {
    console.error("admin_coffee_test_account_list_failed");
  }

  return (
    <section aria-labelledby="admin-coffee-test-account-heading">
      <h2 id="admin-coffee-test-account-heading" className="text-[21px] font-semibold">
        Тестовый аккаунт кофейни
      </h2>
      <p className="mt-1 max-w-[720px] text-sm text-[#796ba0]">
        Возвращает тестовый аккаунт и это устройство к первому визиту на coffee.audiolad.ru:
        первая атмосфера, 30 минут гостем, «Получить 7 дней бесплатно», оплата. Оплаты и заказы
        не удаляются никогда.
      </p>
      <div className="mt-5">
        {accounts === null ? (
          <div className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
            Список тестовых аккаунтов недоступен – возможно, миграция ещё не применена.
          </div>
        ) : (
          <CoffeeTestAccountPanel accounts={accounts} />
        )}
      </div>
    </section>
  );
}
