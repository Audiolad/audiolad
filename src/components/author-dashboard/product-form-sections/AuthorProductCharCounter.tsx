export function AuthorProductCharCounter({
  value,
  max,
}: {
  value: string;
  max: number;
}) {
  return (
    <p className="mt-1 text-right text-xs text-[#7d70a2]">
      {value.length} / {max}
    </p>
  );
}
