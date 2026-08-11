"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useGlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayerProvider";

type PracticeListenCtaLinkProps = {
  href: string;
  className: string;
  children: ReactNode;
};

/**
 * Product listen CTA: unlock the shared Global Player <audio> inside the tap
 * gesture, then navigate to /listen?autoplay=1.
 */
export default function PracticeListenCtaLink({
  href,
  className,
  children,
}: PracticeListenCtaLinkProps) {
  const { prepareSharedAudioGesture } = useGlobalAudioPlayer();

  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        prepareSharedAudioGesture();
      }}
    >
      {children}
    </Link>
  );
}
