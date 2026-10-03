import { saveClassicaPromptAction } from "@/lib/classica/production/actions";

export default function ClassicaPromptForm({
  body,
  error,
}: {
  body: string;
  error?: string;
}) {
  return (
    <form action={saveClassicaPromptAction} className="grid gap-3">
      <textarea
        name="body"
        defaultValue={body}
        className="min-h-80 w-full rounded-2xl border border-[#e4d7f4] px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-[#9b2c4a]">{error}</p> : null}
      <button type="submit" className="w-fit rounded-xl bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
        Сохранить промпт
      </button>
    </form>
  );
}
