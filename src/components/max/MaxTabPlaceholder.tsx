type MaxTabPlaceholderProps = {
  title: string;
};

export default function MaxTabPlaceholder({ title }: MaxTabPlaceholderProps) {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mt-5 text-[26px] font-semibold leading-tight">{title}</h1>
      <p className="mt-1 text-sm leading-5 text-[#6c5d94]">Раздел готовится.</p>
    </div>
  );
}
