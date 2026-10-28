import Link from "next/link";
import { requireAdminPermission } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ADMISSION_SOURCE_LABELS, resolveManualAdmission } from "@/lib/business-admission/policy";
import { addBusinessDirection, saveBusinessAdmissions, setBusinessArtistSoundAuto, setBusinessManualContentGate } from "./actions";
import SelectPage from "./SelectPage";

export const dynamic = "force-dynamic";
type Direction = { key: string; name: string };
type Decision = { author_id: string | null; practice_id: string | null; direction_key: string; allowed: boolean | null; changed_by: string; changed_at: string };
type Row = { id: string; title: string; authorId: string | null; authorName: string };
type Audit = { id: number; actor_id: string; changed_at: string; entity: string; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> };
const PATH = "/admin/business-admissions";
const PAGE_SIZE = 50;

export default async function BusinessAdmissionsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("author_products.moderate");
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const kind = value("kind") === "album" ? "album" : "artist";
  const q = value("q").slice(0, 120);
  const directionFilter = value("direction");
  const decisionFilter = value("decision");
  const page = Math.max(1, Math.min(100000, Number.parseInt(value("page"), 10) || 1));
  let directions: Direction[] = [], decisions: Decision[] = [], rows: Row[] = [], audit: Audit[] = [];
  let unavailable = false;
  let hasMore = false;
  let gateOn = false;
  const soundAuto = new Map<string, boolean>();
  let soundAutoReady = true;
  try {
    const db = createServiceRoleClient();
    const gate = await db.rpc("business_manual_content_gate_enabled");
    if (gate.error) throw new Error("unavailable");
    gateOn = gate.data === true;
    const [dirs, history] = await Promise.all([
      db.from("business_content_directions").select("key, name").eq("active", true).order("key"),
      db.from("business_content_admission_audit").select("id, actor_id, changed_at, entity, old_value, new_value").order("id", { ascending: false }).limit(20),
    ]);
    if (dirs.error || history.error) throw new Error("unavailable");
    directions = dirs.data as Direction[];
    audit = history.data as Audit[];
    // Search and effective-decision filtering happen in SQL before pagination.
    const result = await db.rpc("list_business_content_admissions", {
      p_kind: kind, p_query: q, p_direction: directionFilter || null,
      p_decision: decisionFilter || null, p_offset: (page - 1) * PAGE_SIZE, p_limit: PAGE_SIZE + 1,
    });
    if (result.error) throw new Error("unavailable");
    const listed = result.data as { id: string; title: string; author_id: string | null; author_name: string }[];
    hasMore = listed.length > PAGE_SIZE;
    rows = listed.slice(0, PAGE_SIZE).map((r) => ({ id: r.id, title: r.title, authorId: r.author_id, authorName: r.author_name }));
    const ids = [...new Set(rows.flatMap((r) => [r.id, ...(r.authorId ? [r.authorId] : [])]))];
    if (ids.length) {
      // UUIDs come from the database, never from a raw search string.
      const data = await db.from("business_content_admissions").select("author_id, practice_id, direction_key, allowed, changed_by, changed_at")
        .or(`author_id.in.(${ids.join(",")}),practice_id.in.(${ids.join(",")})`);
      if (data.error) throw new Error("unavailable");
      decisions = data.data as Decision[];
    }
    if (kind === "artist" && rows.length) {
      const flags = await db.from("business_artist_sound_auto").select("author_id, enabled").in("author_id", rows.map((row) => row.id));
      if (flags.error) soundAutoReady = false;
      else for (const flag of (Array.isArray(flags.data) ? flags.data : []) as { author_id: string; enabled: boolean }[]) soundAuto.set(flag.author_id, flag.enabled === true);
    }
  } catch { unavailable = true; }
  const visibleDirections = directions.some((d) => d.key === directionFilter)
    ? directions.filter((d) => d.key === directionFilter) : directions;
  const find = (id: string | null, direction: string, artist: boolean) => decisions.find((d) =>
    (artist ? d.author_id === id : d.practice_id === id) && d.direction_key === direction);
  const href = (nextPage: number) => `${PATH}?${new URLSearchParams({ kind, q, direction: directionFilter, decision: decisionFilter, page: String(nextPage) })}`;
  const context = <>
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="q" value={q} />
    <input type="hidden" name="directionFilter" value={directionFilter} />
    <input type="hidden" name="decision" value={decisionFilter} /><input type="hidden" name="page" value={page} />
  </>;
  return <div className="space-y-6 p-4">
    <h1 className="text-2xl font-semibold">Ручные допуски Business</h1>
    <form action={setBusinessManualContentGate} className="flex flex-wrap items-center gap-3 rounded border p-3">
      <p>{gateOn
        ? "Ручные ворота включены – в эфир попадают только допущенные альбомы и артисты. Непроверенное скрыто."
        : "Ручные ворота выключены – кабинет играет как сейчас. Включайте после пилотных допусков: непроверенное тогда исчезнет из эфира."}</p>
      <input type="hidden" name="enabled" value={gateOn ? "false" : "true"} />
      <button className="rounded border px-3 py-2" type="submit">{gateOn ? "Выключить ручные ворота" : "Включить ручные ворота"}</button>
    </form>
    <p>Артист задаёт базовый допуск. Явное решение альбома имеет приоритет. Без ручного решения доступ закрыт.
      Музыкальный паспорт только предлагает характеристики.</p>
    <p>В таблице показан итог по музыкальной пригодности. Воспроизведение дополнительно требует действующих прав на каждый трек и заведение.
      {" "}<Link className="underline" href="/admin/business-verification">Проверка правообладателей и лицензий</Link>.</p>
    <nav className="flex gap-4"><Link className="underline" href={`${PATH}?kind=artist`} aria-current={kind === "artist" ? "page" : undefined}>Артисты</Link>
      <Link className="underline" href={`${PATH}?kind=album`} aria-current={kind === "album" ? "page" : undefined}>Альбомы</Link></nav>
    {value("result") === "saved" && <p role="status">Изменения сохранены.</p>}
    {value("result").includes("error") && <p role="alert" className="text-red-700">Изменения не сохранены. Проверьте выбор записей, уникальность кода и категорий направления. Повторите попытку.</p>}
    {unavailable ? <p role="alert" className="text-red-700">Таблица недоступна. Проверьте применение миграции ручных допусков и повторите загрузку.</p> : <>
      <form className="flex flex-wrap gap-3" method="get">
        <input type="hidden" name="kind" value={kind} />
        <input aria-label="Поиск" name="q" defaultValue={q} placeholder={kind === "album" ? "Альбом или артист" : "Артист"} className="border p-2" />
        <select aria-label="Направление фильтра" name="direction" defaultValue={directionFilter} className="border p-2">
          <option value="">Все направления</option>{directions.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
        </select>
        <select aria-label="Итоговый допуск" name="decision" defaultValue={decisionFilter} className="border p-2">
          <option value="">Все решения</option><option value="allowed">Разрешено</option><option value="denied">Запрещено явно</option><option value="unreviewed">Не проверено</option>
        </select><button className="rounded border px-3" type="submit">Найти</button>
      </form>
      <form key={href(page)} id="bulk-admissions" action={saveBusinessAdmissions} className="flex flex-wrap items-center gap-3 rounded border p-3">
        {context}<span>Для выбранных записей:</span>
        <select required name="direction" aria-label="Направление массового изменения" defaultValue={directionFilter || directions[0]?.key} className="border p-2">{directions.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</select>
        <select name="allowed" aria-label="Массовое решение" defaultValue="inherit" className="border p-2"><option value="inherit">{kind === "album" ? "Наследовать от артиста" : "Снять решение"}</option><option value="true">Разрешить</option><option value="false">Запретить</option></select>
        <button type="submit" className="rounded border px-3 py-2">Применить к выбранным</button>
      </form>
      <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><caption className="text-left">{kind === "artist" ? "Артисты" : "Альбомы"} – страница {page}, записей: {rows.length}</caption><thead><tr><th><SelectPage key={href(page)} /></th><th className="text-left">{kind === "artist" ? "Артист" : "Альбом / артист"}</th>{kind === "artist" && <th>Автодопуск звучания</th>}{visibleDirections.map((d) => <th key={d.key}>{d.name}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="border-t align-top"><td className="p-2"><input type="checkbox" form="bulk-admissions" name="ids" value={r.id} aria-label={`Выбрать ${r.title}`} /></td><td className="p-2">{r.title}{kind === "album" && <p className="text-neutral-500">{r.authorName}</p>}</td>
          {kind === "artist" && <td className="min-w-40 space-y-2 p-2">{soundAutoReady ? <>
            <p>{soundAuto.get(r.id) ? "Включён" : "Выключен"}</p>
            <form action={setBusinessArtistSoundAuto}>{context}<input type="hidden" name="authorId" value={r.id} /><input type="hidden" name="enabled" value={soundAuto.get(r.id) ? "false" : "true"} />
              <button type="submit" className="underline">{soundAuto.get(r.id) ? "Выключить" : "Включить"}</button>
            </form>
            <p className="text-xs text-neutral-500">Явный статус «Не допущен» у трека важнее. Права и допуск направления не пропускаются.</p>
          </> : <p>Автодопуск недоступен, пока миграция не применена.</p>}</td>}
          {visibleDirections.map((d) => {
            const artist = find(kind === "artist" ? r.id : r.authorId, d.key, true);
            const album = kind === "album" ? find(r.id, d.key, false) : undefined;
            const own = kind === "artist" ? artist : album;
            const effective = resolveManualAdmission(artist, album);
            const changed = album?.allowed != null ? album : artist;
            return <td key={d.key} className="min-w-52 space-y-2 p-2">
              <p>{effective.allowed ? "Разрешено" : "Не допущено"} – {ADMISSION_SOURCE_LABELS[effective.source]}</p>
              <form key={own?.changed_at ?? "unreviewed"} action={saveBusinessAdmissions} className="flex flex-wrap gap-2">{context}<input type="hidden" name="ids" value={r.id} /><input type="hidden" name="direction" value={d.key} />
                <select name="allowed" aria-label={`${r.title}: ${d.name}`} defaultValue={own?.allowed == null ? "inherit" : String(own.allowed)} className="max-w-52 border p-1"><option value="inherit">{kind === "album" ? "От артиста" : "Не проверено"}</option><option value="true">Разрешить</option><option value="false">Запретить</option></select>
                <button type="submit" className="underline">Сохранить</button>
              </form>
              {changed && <p className="break-all text-xs text-neutral-500">{new Date(changed.changed_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} · {changed.changed_by}</p>}
            </td>;
          })}</tr>)}</tbody></table></div>
      {!rows.length && <p>Записи не найдены.</p>}
      <nav className="flex gap-4">{page > 1 && <Link className="underline" href={href(page - 1)}>Назад</Link>}{hasMore && <Link className="underline" href={href(page + 1)}>Далее</Link>}</nav>
      <details className="rounded border p-3"><summary>Добавить направление</summary><form action={addBusinessDirection} className="mt-3 flex flex-wrap gap-3">
        <input required name="key" pattern="[a-z][a-z0-9_]{1,63}" placeholder="Код: hotels" aria-label="Код направления" className="border p-2" />
        <input required name="name" maxLength={120} placeholder="Название" aria-label="Название направления" className="border p-2" />
        <input name="categories" placeholder="Категории заведений через запятую" aria-label="Категории заведений" className="border p-2" />
        <button className="rounded border px-3" type="submit">Добавить без допусков</button>
      </form><p className="mt-2 text-sm">Категории должны точно соответствовать типам заведений. Неизвестная категория закрывает доступ. Добавление направления не разрешает контент.</p></details>
      <details><summary>Последние 20 изменений – кто, когда, что</summary><ul className="space-y-3">{audit.map((a) => <li key={a.id} className="break-all border-b py-2 text-xs">
        {new Date(a.changed_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} · {a.actor_id}
        <pre className="whitespace-pre-wrap">{JSON.stringify({ таблица: a.entity, было: a.old_value, стало: a.new_value }, null, 2)}</pre>
      </li>)}</ul></details>
    </>}
  </div>;
}
