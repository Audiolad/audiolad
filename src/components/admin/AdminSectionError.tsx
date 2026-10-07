type AdminSectionErrorProps = {
  message: string;
  retryHref: string;
};

export default function AdminSectionError({
  message,
  retryHref,
}: AdminSectionErrorProps) {
  return (
    <div
      role="alert"
      className="rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]"
    >
      <p>{message}</p>
      <a
        href={retryHref}
        className="mt-3 inline-flex rounded-full border border-[#e4d7f4] bg-white px-4 py-2 text-sm font-semibold text-[#7042c5]"
      >
        Повторить
      </a>
    </div>
  );
}
