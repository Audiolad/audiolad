"use client";

export default function SelectPage() {
  return <input type="checkbox" aria-label="Выбрать все записи на странице" onChange={(event) => {
    const checked = event.currentTarget.checked;
    document.querySelectorAll<HTMLInputElement>('input[form="bulk-admissions"][name="ids"]').forEach((input) => {
      input.checked = checked;
    });
  }} />;
}
