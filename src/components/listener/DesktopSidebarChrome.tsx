"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";

import DesktopSidebarNav from "@/components/listener/DesktopSidebarNav";
import { useListenerSidebarPinned } from "@/components/listener/ListenerAppShellRoot";
import {
  LISTENER_SIDEBAR_EXPANDED_WIDTH_PX,
  LISTENER_SIDEBAR_FINE_HOVER_QUERY,
  LISTENER_SIDEBAR_FLYOUT_CLOSE_DELAY_MS,
  LISTENER_SIDEBAR_FLYOUT_OPEN_DELAY_MS,
} from "@/lib/navigation/listener-sidebar";

type DesktopSidebarChromeProps = {
  showMyMaterialsNav: boolean;
  showEditorialNav: boolean;
  showEditorialDirectionsNav: boolean;
  showSidebarAuthorPromo: boolean;
  authorCtaHref: string;
  sidebarLogo: StaticImageData;
  sidebarMark: StaticImageData;
  becomeAuthorBanner: StaticImageData;
  logoSizes: string;
  markSizes: string;
  bannerSizes: string;
};

type FlyoutBox = {
  top: number;
  left: number;
  height: number;
};

const SIDEBAR_CARD_CLASS =
  "listener-desktop-sidebar flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-[#fffdfd] shadow-[0_8px_24px_rgba(90,60,145,0.06)]";

function SidebarPinToggle({
  expanded,
  onToggle,
  className = "absolute top-3 right-1 z-10",
}: {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={expanded ? "Свернуть меню" : "Развернуть меню"}
      onClick={onToggle}
      className={`${className} flex h-8 w-8 items-center justify-center rounded-full text-[#9485b4] transition-colors hover:bg-[#f3ebfc] hover:text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
        <path
          d={expanded ? "M12.5 5.5 8 10l4.5 4.5" : "M7.5 5.5 12 10l-4.5 4.5"}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function SpaceHeading() {
  return (
    <Link
      href="/"
      className="block shrink-0 px-3 pt-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9485b4] transition-colors hover:text-[#7f70a8] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
    >
      Моё пространство
    </Link>
  );
}

function AuthorPromoBanner({
  href,
  banner,
  bannerSizes,
}: {
  href: string;
  banner: StaticImageData;
  bannerSizes: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Стать автором на АудиоЛад"
      className="mx-3 mb-3 block shrink-0 transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_6px_16px_rgba(90,60,145,0.14)] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
    >
      <Image src={banner} alt="" sizes={bannerSizes} className="h-auto w-full" />
    </Link>
  );
}

export default function DesktopSidebarChrome({
  showMyMaterialsNav,
  showEditorialNav,
  showEditorialDirectionsNav,
  showSidebarAuthorPromo,
  authorCtaHref,
  sidebarLogo,
  sidebarMark,
  becomeAuthorBanner,
  logoSizes,
  markSizes,
  bannerSizes,
}: DesktopSidebarChromeProps) {
  const { pinned, setPinned } = useListenerSidebarPinned();
  const collapsed = pinned === "collapsed";
  const pinnedRef = useRef(pinned);
  const railRef = useRef<HTMLElement | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [fineHover, setFineHover] = useState(false);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [flyoutBox, setFlyoutBox] = useState<FlyoutBox | null>(null);
  const canPortal = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const navFlags = {
    showMyMaterialsNav,
    showEditorialNav,
    showEditorialDirectionsNav,
  };

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updateFlyoutBox = useCallback(() => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setFlyoutBox({
      top: rect.top,
      left: rect.left,
      height: rect.height,
    });
  }, []);

  const openFlyout = useCallback(() => {
    if (pinnedRef.current !== "collapsed") {
      return;
    }
    updateFlyoutBox();
    setFlyoutOpen(true);
  }, [updateFlyoutBox]);

  const closeFlyout = useCallback(() => {
    setFlyoutOpen(false);
  }, []);

  const scheduleOpen = useCallback(() => {
    if (pinnedRef.current !== "collapsed") {
      return;
    }
    clearTimers();
    openTimerRef.current = window.setTimeout(() => {
      openFlyout();
    }, LISTENER_SIDEBAR_FLYOUT_OPEN_DELAY_MS);
  }, [clearTimers, openFlyout]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimerRef.current = window.setTimeout(() => {
      closeFlyout();
    }, LISTENER_SIDEBAR_FLYOUT_CLOSE_DELAY_MS);
  }, [clearTimers, closeFlyout]);

  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  useEffect(() => {
    const media = window.matchMedia(LISTENER_SIDEBAR_FINE_HOVER_QUERY);
    const sync = () => setFineHover(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!flyoutOpen) {
      return;
    }
    updateFlyoutBox();
    window.addEventListener("resize", updateFlyoutBox);
    return () => window.removeEventListener("resize", updateFlyoutBox);
  }, [flyoutOpen, updateFlyoutBox]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const isInsideCombined = useCallback((node: EventTarget | null) => {
    if (!(node instanceof Node)) {
      return false;
    }
    return Boolean(
      railRef.current?.contains(node) || flyoutRef.current?.contains(node),
    );
  }, []);

  const handleRailMouseEnter = () => {
    if (!collapsed || !fineHover) {
      return;
    }
    scheduleOpen();
  };

  const handleCombinedMouseLeave = (
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    if (!collapsed) {
      return;
    }
    if (isInsideCombined(event.relatedTarget)) {
      return;
    }
    scheduleClose();
  };

  const handleFlyoutMouseEnter = () => {
    if (!collapsed || !fineHover) {
      return;
    }
    clearTimers();
    openFlyout();
  };

  const handleRailFocusIn = () => {
    if (!collapsed) {
      return;
    }
    clearTimers();
    openFlyout();
  };

  const handleCombinedFocusOut = (event: { relatedTarget: EventTarget | null }) => {
    if (!collapsed) {
      return;
    }
    if (isInsideCombined(event.relatedTarget)) {
      return;
    }
    scheduleClose();
  };

  const togglePinned = () => {
    clearTimers();
    setFlyoutOpen(false);
    setPinned(collapsed ? "expanded" : "collapsed");
  };

  const showFlyout = collapsed && flyoutOpen && canPortal && flyoutBox !== null;

  return (
    <>
      <aside
        ref={railRef}
        className={`${SIDEBAR_CARD_CLASS} relative w-[var(--listener-sidebar-width)]`}
        aria-label="Моё пространство"
        data-sidebar-rail={pinned}
        onMouseEnter={handleRailMouseEnter}
        onMouseLeave={handleCombinedMouseLeave}
        onFocus={handleRailFocusIn}
        onBlur={handleCombinedFocusOut}
      >
        <div
          className={`flex shrink-0 py-2 ${
            collapsed
              ? "flex-col items-center gap-1 px-1"
              : "relative min-h-14 items-center px-3"
          }`}
        >
          {collapsed ? (
            <div className="flex h-8 w-full items-center justify-end">
              <SidebarPinToggle
                expanded={false}
                onToggle={togglePinned}
                className="relative"
              />
            </div>
          ) : (
            <SidebarPinToggle expanded onToggle={togglePinned} />
          )}
          <Link
            href="/"
            className="inline-flex max-w-full rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {collapsed ? (
              <Image
                src={sidebarMark}
                alt="АудиоЛад"
                className="h-10 w-10 object-contain"
                sizes={markSizes}
              />
            ) : (
              <Image
                src={sidebarLogo}
                alt="АудиоЛад"
                className="h-10 w-auto max-w-full object-contain object-left"
                sizes={logoSizes}
              />
            )}
          </Link>
        </div>

        {collapsed ? null : <SpaceHeading />}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
          <DesktopSidebarNav
            {...navFlags}
            variant={collapsed ? "icons" : "labels"}
          />
        </div>

        {!collapsed && showSidebarAuthorPromo ? (
          <AuthorPromoBanner
            href={authorCtaHref}
            banner={becomeAuthorBanner}
            bannerSizes={bannerSizes}
          />
        ) : null}
      </aside>

      {showFlyout
        ? createPortal(
            <div
              ref={flyoutRef}
              className={`listener-sidebar-flyout ${SIDEBAR_CARD_CLASS} fixed`}
              style={{
                top: flyoutBox.top,
                left: flyoutBox.left,
                height: flyoutBox.height,
                width: LISTENER_SIDEBAR_EXPANDED_WIDTH_PX,
              }}
              data-sidebar-flyout="true"
              onMouseEnter={handleFlyoutMouseEnter}
              onMouseLeave={handleCombinedMouseLeave}
              onFocus={handleRailFocusIn}
              onBlur={handleCombinedFocusOut}
            >
              <div className="flex min-h-14 shrink-0 items-center px-3 py-2">
                <Link
                  href="/"
                  className="inline-flex max-w-full rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                  tabIndex={-1}
                >
                  <Image
                    src={sidebarLogo}
                    alt="АудиоЛад"
                    className="h-10 w-auto max-w-full object-contain object-left"
                    sizes={logoSizes}
                  />
                </Link>
              </div>

              <SidebarPinToggle expanded={false} onToggle={togglePinned} />
              <SpaceHeading />

              <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                <DesktopSidebarNav {...navFlags} variant="labels" decorative />
              </div>

              {showSidebarAuthorPromo ? (
                <AuthorPromoBanner
                  href={authorCtaHref}
                  banner={becomeAuthorBanner}
                  bannerSizes={bannerSizes}
                />
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
