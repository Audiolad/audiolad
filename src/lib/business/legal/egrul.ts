import type { BusinessInnKind } from "./inn";

/**
 * Разбор ответа публичного поиска ФНС (egrul.nalog.ru) по ИНН (t1591u).
 * Поиск отдаёт наименование, ОГРН/ОГРНИП, дату регистрации и дату прекращения деятельности.
 * Юридического адреса в ответе нет (у ИП он не публикуется), поэтому мы его не храним.
 */

export type BusinessRegistryIdentity = {
  inn: string;
  kind: BusinessInnKind;
  /** Полное наименование из реестра: «ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ …» или ФИО ИП. */
  fullName: string;
  /** Для документов: «ООО «РОМАШКА»» или «ИП Иванов Иван Иванович». */
  displayName: string;
  ogrn: string;
  /** ДД.ММ.ГГГГ из реестра, если есть. */
  registeredOn: string | null;
};

export type BusinessRegistryLookup =
  | { ok: true; identity: BusinessRegistryIdentity }
  | { ok: false; error: "inn_not_found" | "inn_inactive" | "registry_unavailable" };

type Row = { i?: unknown; k?: unknown; n?: unknown; c?: unknown; o?: unknown; r?: unknown; e?: unknown };

function str(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

/** «ПЕТРОВ СЕРГЕЙ СЕРГЕЕВИЧ» → «Петров Сергей Сергеевич» (каждая часть, в том числе через дефис). */
export function titleCaseRu(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/(^|[\s-])([a-zа-яё])/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase("ru-RU"));
}

/** Прямые кавычки реестра → ёлочки: ООО "РОМАШКА" → ООО «РОМАШКА». */
export function russianQuotes(value: string): string {
  let open = true;
  return value.replace(/"/g, () => {
    const q = open ? "«" : "»";
    open = !open;
    return q;
  });
}

function isDate(v: string): boolean {
  return /^\d{2}\.\d{2}\.\d{4}$/.test(v);
}

/** Выбирает действующую запись с этим ИНН. Записи с датой прекращения («e») не подходят. */
export function parseRegistryRows(inn: string, payload: unknown): BusinessRegistryLookup {
  const rows: Row[] =
    payload && typeof payload === "object" && Array.isArray((payload as { rows?: unknown }).rows)
      ? ((payload as { rows: Row[] }).rows)
      : [];
  const same = rows.filter((row) => str(row.i) === inn);
  if (!same.length) return { ok: false, error: "inn_not_found" };
  const active = same.find((row) => !str(row.e));
  if (!active) return { ok: false, error: "inn_inactive" };
  const kind: BusinessInnKind = str(active.k) === "fl" ? "ip" : "ul";
  const fullName = str(active.n);
  const ogrn = str(active.o);
  const ogrnOk = kind === "ip" ? /^\d{15}$/.test(ogrn) : /^\d{13}$/.test(ogrn);
  if (!fullName || !ogrnOk) return { ok: false, error: "registry_unavailable" };
  const short = str(active.c);
  const displayName = kind === "ip" ? `ИП ${titleCaseRu(fullName)}` : russianQuotes(short || fullName);
  const registered = str(active.r);
  return {
    ok: true,
    identity: {
      inn,
      kind,
      fullName: kind === "ip" ? titleCaseRu(fullName) : russianQuotes(fullName),
      displayName,
      ogrn,
      registeredOn: isDate(registered) ? registered : null,
    },
  };
}

/** Колонки business_organizations по свежему ответу реестра (ввод ИНН и повторная проверка). */
export function organizationLegalColumns(identity: BusinessRegistryIdentity, now: Date) {
  const date = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(identity.registeredOn ?? "");
  return {
    legal_inn: identity.inn,
    legal_kind: identity.kind,
    legal_name: identity.displayName,
    legal_full_name: identity.fullName,
    legal_ogrn: identity.ogrn,
    legal_registered_on: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
    legal_checked_at: now.toISOString(),
    legal_inactive_at: null,
  };
}
