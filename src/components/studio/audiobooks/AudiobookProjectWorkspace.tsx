"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AudiobookChapter, AudiobookFragment, AudiobookProject } from "@/lib/audiobooks/server";

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error("request_failed");
  return response.status === 204 ? null : response.json();
}
export function AudiobookProjectWorkspace({ project, chapters: initialChapters, authorId }: { project: AudiobookProject; chapters: AudiobookChapter[]; authorId: string }) {
  const router = useRouter(); const fileInput = useRef<HTMLInputElement>(null); const [chapters, setChapters] = useState(initialChapters); const [selected, setSelected] = useState<string | null>(initialChapters[0]?.id ?? null); const [busy, setBusy] = useState(false); const [confirmingDelete, setConfirmingDelete] = useState(false); const [fragments, setFragments] = useState<AudiobookFragment[]>([]); const [uploadError, setUploadError] = useState<string | null>(null);
  const base = `/api/studio/audiobooks/projects/${project.id}/chapters`;
  async function add() { const title = window.prompt("Название главы", `Глава ${chapters.length + 1}`)?.trim(); if (!title) return; setBusy(true); try { const { chapter } = await request(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId, title }) }); setChapters([...chapters, chapter]); setSelected(chapter.id); } finally { setBusy(false); } }
  async function rename(chapter: AudiobookChapter) { const title = window.prompt("Название главы", chapter.title)?.trim(); if (!title) return; const { chapter: next } = await request(`${base}/${chapter.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId, title }) }); setChapters(chapters.map((item) => item.id === next.id ? next : item)); }
  async function remove(chapter: AudiobookChapter) { if (!window.confirm(`Удалить главу?\n«${chapter.title}» будет удалена.`)) return; await request(`${base}/${chapter.id}?authorId=${authorId}`, { method: "DELETE" }); const next = chapters.filter((item) => item.id !== chapter.id).map((item, index) => ({ ...item, position: index + 1 })); setChapters(next); setSelected(next[0]?.id ?? null); }
  async function move(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= chapters.length) return; const next = [...chapters]; [next[index], next[target]] = [next[target], next[index]]; setBusy(true); try { const { chapters: saved } = await request(`${base}/reorder`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId, chapterIds: next.map((item) => item.id) }) }); setChapters(saved); } finally { setBusy(false); } }
  async function renameBook() { const title = window.prompt("Название книги", project.title)?.trim(); if (!title) return; await request(`/api/studio/audiobooks/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId, title }) }); router.refresh(); }
  async function deleteBook() { setBusy(true); try { await request(`/api/studio/audiobooks/projects/${project.id}?authorId=${authorId}`, { method: "DELETE" }); router.push("/studio/audiobooks"); } finally { setBusy(false); } }
  const fragmentBase = selected ? `${base}/${selected}/fragments` : null;
  useEffect(() => {
    if (!fragmentBase) return;
    let active = true;
    request(`${fragmentBase}?authorId=${authorId}`).then(({ fragments: next }) => {
      if (active) setFragments(next);
    }).catch(() => { if (active) setUploadError("Не удалось загрузить список фрагментов."); });
    return () => { active = false; };
  }, [authorId, fragmentBase]);
  async function upload(file: File) {
    if (!fragmentBase) return;
    setBusy(true); setUploadError(null);
    try {
      const reserved = await request(fragmentBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId, originalName: file.name, mimeType: file.type, sizeBytes: file.size }) });
      let signedUpload = reserved.signedUpload;
      let uploadResult = await createClient().storage.from("audiobook-fragments").uploadToSignedUrl(signedUpload.path, signedUpload.token, file, { contentType: file.type });
      if (uploadResult.error) {
        const retry = await request(`${fragmentBase}/${reserved.fragment.id}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId }) });
        signedUpload = retry.signedUpload;
        uploadResult = await createClient().storage.from("audiobook-fragments").uploadToSignedUrl(signedUpload.path, signedUpload.token, file, { contentType: file.type });
      }
      if (uploadResult.error) throw new Error("storage_upload_failed");
      const { fragment } = await request(`${fragmentBase}/${reserved.fragment.id}/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId }) });
      setFragments((current) => [...current, fragment].sort((left, right) => left.position - right.position));
    } catch {
      setUploadError("Загрузка не завершена. Повторите попытку.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function removeFragment(fragment: AudiobookFragment) {
    if (!fragmentBase || !window.confirm(`Удалить фрагмент «${fragment.original_name}»?`)) return;
    setBusy(true);
    try {
      await request(`${fragmentBase}/${fragment.id}?authorId=${authorId}`, { method: "DELETE" });
      setFragments((current) => current.filter((item) => item.id !== fragment.id).map((item, index) => ({ ...item, position: index + 1 })));
    } catch { setUploadError("Не удалось удалить фрагмент."); } finally { setBusy(false); }
  }
  const chapter = chapters.find((item) => item.id === selected);
  return <><header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-6"><div><h1 className="text-3xl font-semibold">{project.title}</h1><button type="button" onClick={renameBook} className="mt-2 text-sm font-semibold text-[#9bdab5] underline">Переименовать книгу</button></div><button type="button" onClick={() => setConfirmingDelete(true)} className="text-sm font-semibold text-[#ffb4b4] underline">Удалить книгу</button></header><section className="grid flex-1 gap-5 py-8 lg:grid-cols-[18rem_minmax(0,1fr)]"><aside className="rounded-[28px] border border-white/15 bg-[#21133d] p-6"><h2 className="text-xl font-semibold">Главы</h2><div className="mt-4 space-y-2">{chapters.map((item, index) => <div key={item.id} className={`rounded-xl p-3 ${selected === item.id ? "bg-[#4c3a6f]" : "bg-white/5"}`}><button type="button" onClick={() => { setSelected(item.id); setUploadError(null); }} className="w-full text-left text-sm">{item.position}. {item.title}</button><div className="mt-2 flex gap-2 text-xs text-[#ddd2f5]"><button disabled={busy || index === 0} onClick={() => move(index, -1)}>↑ Выше</button><button disabled={busy || index === chapters.length - 1} onClick={() => move(index, 1)}>↓ Ниже</button><button onClick={() => rename(item)}>Переименовать</button><button onClick={() => remove(item)}>Удалить</button></div></div>)}</div><button type="button" disabled={busy} onClick={add} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#8065ad] px-5 text-sm font-semibold text-white">+ Добавить главу</button></aside><section className="min-h-80 rounded-[28px] border border-[#9074c7] bg-[#271647] p-6"><h2 className="text-2xl font-semibold">{chapter ? chapter.title : "Выберите главу"}</h2>{chapter ? <div className="mt-6"><input ref={fileInput} type="file" accept="audio/webm,audio/mp4,audio/mpeg,audio/wav,audio/x-wav,audio/aac" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /><button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#9bdab5] px-5 text-sm font-semibold text-[#1c1530]">{busy ? "Загрузка…" : "Загрузить аудиофрагмент"}</button><p className="mt-3 text-sm text-[#ddd2f5]">До 200 МБ. Аудио загружается напрямую в приватное хранилище.</p>{uploadError ? <p role="alert" className="mt-3 text-sm text-[#ffb4b4]">{uploadError}</p> : null}<ol className="mt-6 space-y-2">{fragments.map((fragment) => <li key={fragment.id} className="flex items-center justify-between gap-4 rounded-xl bg-white/5 p-3 text-sm"><span>{fragment.position}. {fragment.original_name} <span className="text-[#cfc4e4]">({Math.ceil(fragment.size_bytes / 1024 / 1024)} МБ)</span></span><button type="button" disabled={busy} onClick={() => void removeFragment(fragment)} className="text-[#ffb4b4] underline">Удалить</button></li>)}</ol></div> : <p className="mt-4 leading-7 text-[#ddd2f5]">После создания главы здесь появится загрузка фрагментов.</p>}</section></section>{confirmingDelete ? <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"><section className="w-full max-w-md rounded-[28px] bg-[#271647] p-6"><h2 className="text-2xl font-semibold">Удалить аудиокнигу?</h2><p className="mt-4 text-[#ddd2f5]">«{project.title}» будет удалена вместе со всеми главами.</p><div className="mt-7 flex gap-3"><button type="button" onClick={deleteBook} disabled={busy} className="rounded-full bg-[#d95d6b] px-5 py-3 font-semibold">Удалить</button><button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy} className="rounded-full border border-white/25 px-5 py-3 font-semibold">Отмена</button></div></section></div> : null}</>;
}
