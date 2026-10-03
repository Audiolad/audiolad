import CreateClassicaJobForm from "@/components/classica/CreateClassicaJobForm";
import { requireClassicaAdmin } from "@/lib/classica/production/access";

export const dynamic = "force-dynamic";

export default async function NewClassicaJobPage() {
  await requireClassicaAdmin();

  return (
    <section className="max-w-xl">
      <h2 className="text-xl font-semibold">Новая работа</h2>
      <p className="mt-2 text-sm text-[#796ba0]">
        Каталог сам не создаётся. Первые 12 работ добавляются здесь вручную.
      </p>
      <div className="mt-4">
        <CreateClassicaJobForm />
      </div>
    </section>
  );
}
