"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AudiobookCreator({ authorId }: { authorId: string }) {
  const router = useRouter(); const [title, setTitle] = useState(""); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function create() {
    setSaving(true); setError(null);
    const response = await fetch("/api/studio/audiobooks/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId, title }) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.project?.id) { setError("Не удалось создать аудиокнигу. Проверьте название и попробуйте ещё раз."); setSaving(false); return; }
    router.push(`/studio/audiobooks/${body.project.id}`);
  }
  return <div className="w-full rounded-[28px] border border-[#9074c7] bg-[#271647] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)] sm:p-8">
    <label htmlFor="audiobook-title" className="text-sm font-semibold text-[#eadfff]">Название книги</label>
    <input id="audiobook-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Введите название книги" className="mt-3 min-h-12 w-full rounded-xl border border-[#a98be0] bg-[#21133d] px-4 text-base text-white outline-none placeholder:text-[#b9accd] focus:border-[#9bdab5] focus:ring-2 focus:ring-[#9bdab5]/30" />
    {error ? <p role="alert" className="mt-3 text-sm text-[#ffb4b4]">{error}</p> : null}
    <button type="button" onClick={create} disabled={saving || !title.trim()} className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530] disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Создаём…" : "Создать аудиокнигу"}</button>
  </div>;
}
