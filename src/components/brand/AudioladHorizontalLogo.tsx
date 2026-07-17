import Image from "next/image";
import Link from "next/link";

const HORIZONTAL_LOGO_WIDTH = 2172;
const HORIZONTAL_LOGO_HEIGHT = 724;

type AudioladHorizontalLogoProps = {
  className?: string;
  linkClassName?: string;
  priority?: boolean;
};

export default function AudioladHorizontalLogo({
  className = "h-8 w-auto object-contain object-left",
  linkClassName = "inline-flex max-w-full shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]",
  priority = false,
}: AudioladHorizontalLogoProps) {
  return (
    <Link href="/" className={linkClassName}>
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
