"use client";

import { useActionState } from "react";
import { saveGraduateAction } from "@/app/(platform)/admin/school-graduates/actions";
import { graduateText, type SchoolGraduate } from "@/lib/school/graduates";

type Author = { id: string; name: string };
type Product = { id: string; title: string; author_id: string };
const field = "min-h-11 w-full min-w-0 rounded-xl border border-[#e4d7f4] bg-white px-3 py-2 text-sm";
const button = "min-h-11 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-50";

function EditorForm({ graduate, authors, products }: { graduate?: SchoolGraduate; authors: Author[]; products: Product[] }) {
  const [state, action, pending] = useActionState(saveGraduateAction, {});
  const choices = products.filter((product) => product.author_id === graduate?.author_id);
  return (
    <form action={action} className="min-w-0 space-y-4 rounded-3xl border border-[#e4d7f4] bg-white p-5">
      {graduate ? <>
        <h3 className="break-words text-lg font-semibold">{graduateText(authors.find((author) => author.id === graduate.author_id)?.name ?? "Автор")}</h3>
        <input type="hidden" name="author_id" value={graduate.author_id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="min-w-0 text-sm">Поток<input name="cohort" maxLength={100} defaultValue={graduate.cohort} className={field} /></label>
          <label className="min-w-0 text-sm">Порядок выпускника<input name="position" type="number" min={0} max={2147483647} required defaultValue={graduate.position} className={field} /></label>
          {[graduate.product_1_id, graduate.product_2_id].map((id, index) => <label key={index} className="min-w-0 text-sm">Продукт {index + 1}
            <select name="product_id" defaultValue={id ?? ""} className={field}>
              <option value="">Не выбран</option>
              {id && !choices.some((product) => product.id === id) ? <option value={id}>Недоступен для показа – замените или уберите</option> : null}
              {choices.map((product) => <option key={product.id} value={product.id}>{graduateText(product.title)}</option>)}
            </select>
          </label>)}
        </div>
        <p className="text-sm text-[#796ba0]">Показываются по порядку: продукт 1, затем продукт 2. Для перестановки поменяйте выбор в слотах.</p>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input name="enabled" type="checkbox" defaultChecked={graduate.enabled} />Выпускник Школы аудиопрактик</label>
        <div className="flex flex-wrap gap-3">
          <button name="operation" value="save" disabled={pending} className={button}>Сохранить</button>
          <button name="operation" value="remove" disabled={pending} className={button}>Убрать из выпускников</button>
        </div>
      </> : <>
        <label className="block text-sm">Автор платформы<select name="author_id" required defaultValue="" className={field}>
          <option value="" disabled>Выберите автора</option>
          {authors.map((author) => <option key={author.id} value={author.id}>{graduateText(author.name)}</option>)}
        </select></label>
        <button name="operation" value="add" disabled={pending || !authors.length} className={button}>Добавить выпускника</button>
      </>}
      {state.error ? <div role="alert" className="text-sm text-red-700"><p>{state.error}</p>{state.errorLinks?.length ? <p className="mt-1 flex flex-col gap-1">{state.errorLinks.map((link) => <a key={link.href} href={link.href} className="underline">{link.label}</a>)}</p> : null}</div> : null}
      {state.success ? <p role="status" className="text-sm text-green-800">{state.success}</p> : null}
    </form>
  );
}

export default function SchoolGraduatesEditor({ graduates, authors, products }: { graduates: SchoolGraduate[]; authors: Author[]; products: Product[] }) {
  return <div className="mt-6 space-y-5">
    <EditorForm authors={authors.filter((author) => !graduates.some((graduate) => graduate.author_id === author.id))} products={[]} />
    {graduates.map((graduate) => <EditorForm key={`${graduate.author_id}:${JSON.stringify(graduate)}`} graduate={graduate} authors={authors} products={products} />)}
    {!graduates.length ? <p className="text-sm text-[#796ba0]">Выпускники ещё не выбраны. Публичная витрина скрыта.</p> : null}
  </div>;
}
