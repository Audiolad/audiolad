import ClassicaPromptForm from "@/components/classica/ClassicaPromptForm";
import { requireClassicaAdmin } from "@/lib/classica/production/access";
import { getClassicaMasterPrompt } from "@/lib/classica/production/queries";

export const dynamic = "force-dynamic";

export default async function ClassicaPromptPage() {
  const session = await requireClassicaAdmin();
  const body = await getClassicaMasterPrompt(session.supabase);

  return (
    <section className="max-w-3xl">
      <h2 className="text-xl font-semibold">Мастер-промпт оформления</h2>
      <p className="mt-2 text-sm text-[#796ba0]">
        Этот текст один на всех операторов. К нему на сервере всегда добавляется запрет выдумывать факты, даты и каталожные номера.
      </p>
      <div className="mt-4">
        <ClassicaPromptForm body={body} />
      </div>
    </section>
  );
}
