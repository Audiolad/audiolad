import Link from "next/link";

export const primaryNavItems = [
  { title: "Главная", href: "/" },
  { title: "Аудиоподкаст", href: "/first-audio-course" },
] as const;

export default function PrimaryNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Основная навигация" className={className}>
      {primaryNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="text-[15px] font-medium text-[#4c3d78] underline-offset-4 transition-colors hover:text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {item.title}
        </Link>
      ))}
    </nav>
  );
}
