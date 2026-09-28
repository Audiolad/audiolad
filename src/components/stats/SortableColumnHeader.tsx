import type { SortOrder } from "@/lib/stats/table-sort";

export default function SortableColumnHeader({
  label,
  active,
  direction,
  onSort,
}: {
  label: string;
  active: boolean;
  direction: SortOrder;
  onSort: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSort}
      className={`inline-flex w-full cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left font-medium transition-colors hover:bg-[#f4efff] hover:text-[#5b4d86] ${
        active ? "text-[#7042c5]" : "text-inherit"
      }`}
    >
      <span>{label}</span>
      {active ? (
        <span aria-hidden="true">{direction === "desc" ? "↓" : "↑"}</span>
      ) : null}
    </button>
  );
}
