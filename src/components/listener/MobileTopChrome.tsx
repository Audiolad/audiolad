"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import {
  joinMobileTopChromeClassNames,
  spacerStyleFromChromeHeight,
  type MobileTopChromeVariant,
} from "@/lib/listener/mobile-top-chrome";

const VARIANT_CHROME_CLASS: Record<MobileTopChromeVariant, string> = {
  catalog: "px-5 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-3",
  playlists: "px-5 pt-[max(0.25rem,env(safe-area-inset-top,0px))] pb-0",
  library: "pt-[max(0.25rem,env(safe-area-inset-top,0px))] pb-0",
};

type MobileTopChromeProps = {
  variant: MobileTopChromeVariant;
  className?: string;
  children: ReactNode;
};

/**
 * Shared mobile top chrome: fixed layer + matching spacer.
 * ResizeObserver measures the chrome's natural content height and writes
 * that px value onto the spacer only — never back onto the chrome.
 */
export default function MobileTopChrome({
  variant,
  className,
  children,
}: MobileTopChromeProps) {
  const chromeRef = useRef<HTMLDivElement | null>(null);
  const [spacerHeightPx, setSpacerHeightPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const chromeNode = chromeRef.current;
    if (!chromeNode) {
      return;
    }

    function applyMeasuredHeight(node: HTMLElement) {
      const height = node.getBoundingClientRect().height;
      setSpacerHeightPx((current) => (current === height ? current : height));
    }

    applyMeasuredHeight(chromeNode);

    const observer = new ResizeObserver(() => {
      applyMeasuredHeight(chromeNode);
    });
    observer.observe(chromeNode);

    return () => {
      observer.disconnect();
    };
  }, [variant]);

  return (
    <>
      <div
        ref={chromeRef}
        data-mobile-top-chrome={variant}
        data-mobile-top-chrome-variant={variant}
        className={joinMobileTopChromeClassNames(
          "mobile-top-chrome listener-catalog-mobile-search fixed top-0 inset-x-0 z-30 bg-platform-surface xl:hidden",
          VARIANT_CHROME_CLASS[variant],
          className,
        )}
      >
        {children}
      </div>
      <div
        data-mobile-top-chrome-spacer={variant}
        data-mobile-top-chrome-variant={variant}
        className="mobile-top-chrome-spacer listener-catalog-mobile-search-spacer xl:hidden"
        aria-hidden="true"
        style={spacerStyleFromChromeHeight(spacerHeightPx)}
      />
    </>
  );
}
