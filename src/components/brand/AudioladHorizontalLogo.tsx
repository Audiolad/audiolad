import Image from "next/image";
import Link from "next/link";

const HORIZONTAL_LOGO_WIDTH = 600;
const HORIZONTAL_LOGO_HEIGHT = 200;

/** Mobile: 64px height (~2× base). Tablet/desktop (md+): 32px height. */
export const audioladHorizontalLogoImageClassName =
  "h-16 w-auto max-w-full object-contain object-left md:h-8";

export const audioladHorizontalLogoLinkClassName =
  "inline-flex min-w-0 max-w-[calc(100%-9.5rem)] shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] md:max-w-full";

/** Profile header: one action on the right, full 2× logo width on mobile. */
export const audioladHorizontalLogoProfileLinkClassName =
  "inline-flex min-w-0 max-w-[12rem] shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] md:max-w-full";

type AudioladHorizontalLogoProps = {
  className?: string;
  linkClassName?: string;
  priority?: boolean;
  variant?: "default" | "profile";
};

export default function AudioladHorizontalLogo({
  className = audioladHorizontalLogoImageClassName,
  linkClassName,
  priority = false,
  variant = "default",
}: AudioladHorizontalLogoProps) {
  const resolvedLinkClassName =
    linkClassName ??
    (variant === "profile"
      ? audioladHorizontalLogoProfileLinkClassName
      : audioladHorizontalLogoLinkClassName);
  return (
    <Link href="/" className={resolvedLinkClassName}>
      <Image
        src="/brand/audiolad-logo-horizontal.png"
        alt="АудиоЛад"
        width={HORIZONTAL_LOGO_WIDTH}
        height={HORIZONTAL_LOGO_HEIGHT}
        className={className}
        priority={priority}
      />
    </Link>
  );
}
